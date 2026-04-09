import {
  Injectable,
  BadRequestException,
  HttpException,
  HttpStatus,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { UsersService } from 'src/users/users.service';
import { SecurityProfilesService } from 'src/security-profiles/security-profiles.service';
import { TokensService } from 'src/tokens/tokens.service';
import { AuditService } from 'src/audit/audit.service';
import { AuthAction } from 'src/audit/auth-log.entity';
import { HashingUtil, HashAlgorithm } from 'src/common/utils/hashing.util';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { FaceEmbeddingSampleDto } from './dto/face-embedding-sample.dto';
import {
  DEFAULT_FACE_THRESHOLD,
  FaceBiometricService,
} from './face-biometric.service';
import { FaceCaptureDto } from './dto/face-capture.dto';

const MFA_CHALLENGE_TTL_SECONDS = 300;
const CAPTCHA_CHALLENGE_TTL_SECONDS = 180;
const FACE_CHALLENGE_TTL_SECONDS = 180;
const CAPTCHA_CODE_LENGTH = 6;
const EMAIL_OTP_LENGTH = 6;
const EMAIL_OTP_TTL_SECONDS = 300;

type OtpPurpose = 'login' | 'setup' | 'disable';

type CaptchaChallenge = {
  userId: string;
  answer: string;
  expiresAt: number;
};

@Injectable()
export class AuthService {
  private readonly captchaChallenges = new Map<string, CaptchaChallenge>();

  constructor(
    private readonly usersService: UsersService,
    private readonly profilesService: SecurityProfilesService,
    private readonly tokensService: TokensService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
    private readonly faceBiometricService: FaceBiometricService,
  ) {}

  private cleanupExpiredCaptchaChallenges() {
    const now = Date.now();
    for (const [challengeId, challenge] of this.captchaChallenges.entries()) {
      if (challenge.expiresAt <= now) {
        this.captchaChallenges.delete(challengeId);
      }
    }
  }

  private generateEmailOtpCode() {
    const min = 10 ** (EMAIL_OTP_LENGTH - 1);
    const max = 10 ** EMAIL_OTP_LENGTH;
    return String(crypto.randomInt(min, max));
  }

  private hashEmailOtp(code: string) {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  private maskEmail(email: string) {
    const [localPart, domainPart = ''] = email.split('@');
    const localVisible =
      localPart.length <= 2
        ? `${localPart[0] ?? '*'}*`
        : `${localPart.slice(0, 2)}${'*'.repeat(
            Math.max(1, localPart.length - 2),
          )}`;

    return `${localVisible}@${domainPart}`;
  }

  private async sendEmailOtp(
    email: string,
    code: string,
    purpose: OtpPurpose,
  ) {
    const senderEmail = process.env.GMAIL_USER;
    const senderPassword = process.env.GMAIL_APP_PASSWORD;

    const subjectMap: Record<OtpPurpose, string> = {
      login: 'Your login verification code',
      setup: 'Your email OTP setup code',
      disable: 'Your email OTP disable code',
    };

    const purposeLabelMap: Record<OtpPurpose, string> = {
      login: 'finish signing in',
      setup: 'enable email OTP on your account',
      disable: 'disable email OTP on your account',
    };

    if (!senderEmail || !senderPassword) {
      // Demo fallback so the flow remains usable locally without SMTP credentials.
      console.log(
        `[EMAIL OTP] purpose=${purpose} email=${email} code=${code}`,
      );
      return;
    }

    let nodemailer: any;
    try {
      nodemailer = require('nodemailer');
    } catch {
      throw new InternalServerErrorException(
        'Email delivery is not available. Install nodemailer or configure local demo mode.',
      );
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: senderEmail,
        pass: senderPassword,
      },
    });

    await transporter.sendMail({
      from: senderEmail,
      to: email,
      subject: subjectMap[purpose],
      text: `Your verification code is ${code}. It expires in ${EMAIL_OTP_TTL_SECONDS / 60} minutes. Use this code to ${purposeLabelMap[purpose]}.`,
    });
  }

  private async issueEmailOtp(userId: string, email: string, purpose: OtpPurpose) {
    const code = this.generateEmailOtpCode();
    const user = await this.usersService.findById(userId);
    user.emailOtpHash = this.hashEmailOtp(code);
    user.emailOtpExpiresAt = new Date(Date.now() + EMAIL_OTP_TTL_SECONDS * 1000);
    user.emailOtpPurpose = purpose;
    await this.usersService.save(user);

    await this.sendEmailOtp(email, code, purpose);

    return {
      delivery: 'email',
      email: this.maskEmail(email),
      expiresIn: EMAIL_OTP_TTL_SECONDS,
    };
  }

  private async verifyEmailOtp(userId: string, code: string, purpose: OtpPurpose) {
    const user = await this.usersService.findById(userId);

    if (
      !user.emailOtpHash ||
      !user.emailOtpExpiresAt ||
      !user.emailOtpPurpose
    ) {
      throw new UnauthorizedException('Invalid or expired email OTP');
    }

    if (user.emailOtpExpiresAt.getTime() <= Date.now()) {
      user.emailOtpHash = null;
      user.emailOtpExpiresAt = null;
      user.emailOtpPurpose = null;
      await this.usersService.save(user);
      throw new UnauthorizedException('Invalid or expired email OTP');
    }

    if (user.emailOtpPurpose !== purpose) {
      throw new UnauthorizedException('Invalid or expired email OTP');
    }

    if (user.emailOtpHash !== this.hashEmailOtp(code.trim())) {
      throw new UnauthorizedException('Invalid email OTP code');
    }

    user.emailOtpHash = null;
    user.emailOtpExpiresAt = null;
    user.emailOtpPurpose = null;
    await this.usersService.save(user);
  }

  private generateCaptchaCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789!@#$%&*';
    return Array.from({ length: CAPTCHA_CODE_LENGTH }, () => {
      const index = crypto.randomInt(0, chars.length);
      return chars[index];
    }).join('');
  }

  private escapeSvgText(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private renderCaptchaDataUrl(code: string) {
    const lineA = `${crypto.randomInt(8, 40)} ${crypto.randomInt(8, 28)} ${crypto.randomInt(120, 160)} ${crypto.randomInt(8, 28)}`;
    const lineB = `${crypto.randomInt(8, 40)} ${crypto.randomInt(36, 52)} ${crypto.randomInt(120, 160)} ${crypto.randomInt(36, 52)}`;
    const rotate = crypto.randomInt(-8, 9);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="64" viewBox="0 0 180 64">
<rect width="180" height="64" fill="#0f172a"/>
<line x1="${lineA.split(' ')[0]}" y1="${lineA.split(' ')[1]}" x2="${lineA.split(' ')[2]}" y2="${lineA.split(' ')[3]}" stroke="#38bdf8" stroke-width="1.5" opacity="0.45"/>
<line x1="${lineB.split(' ')[0]}" y1="${lineB.split(' ')[1]}" x2="${lineB.split(' ')[2]}" y2="${lineB.split(' ')[3]}" stroke="#22d3ee" stroke-width="1.5" opacity="0.45"/>
<text x="90" y="42" text-anchor="middle" font-family="monospace" font-size="34" letter-spacing="6" fill="#e2e8f0" transform="rotate(${rotate} 90 32)">${this.escapeSvgText(code)}</text>
</svg>`;

    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  }

  private createCaptchaChallenge(userId: string) {
    this.cleanupExpiredCaptchaChallenges();

    const captchaId = crypto.randomUUID();
    const answer = this.generateCaptchaCode();
    const expiresAt = Date.now() + CAPTCHA_CHALLENGE_TTL_SECONDS * 1000;

    this.captchaChallenges.set(captchaId, {
      userId,
      answer,
      expiresAt,
    });

    return {
      captchaRequired: true,
      captchaId,
      captchaImageDataUrl: this.renderCaptchaDataUrl(answer),
      captchaExpiresIn: CAPTCHA_CHALLENGE_TTL_SECONDS,
    };
  }

  async refreshCaptchaChallenge(captchaId: string) {
    this.cleanupExpiredCaptchaChallenges();
    const challenge = this.captchaChallenges.get(captchaId);

    if (!challenge) {
      throw new UnauthorizedException('Invalid or expired captcha challenge');
    }

    this.captchaChallenges.delete(captchaId);
    return this.createCaptchaChallenge(challenge.userId);
  }

  private async buildAuthTokens(user: Awaited<ReturnType<UsersService['findById']>>) {
    const profile = user.securityProfile;

    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role?.name ?? null,
      },
      { expiresIn: profile.accessTokenTTL },
    );

    const refreshToken = await this.tokensService.createRefreshToken(
      user,
      profile.refreshTokenTTL,
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: profile.accessTokenTTL,
    };
  }

  private createMfaChallenge(userId: string): string {
    return this.jwtService.sign(
      {
        sub: userId,
        purpose: 'mfa-login',
      },
      { expiresIn: MFA_CHALLENGE_TTL_SECONDS },
    );
  }

  private createFaceChallenge(userId: string): string {
    return this.jwtService.sign(
      {
        sub: userId,
        purpose: 'face-login',
      },
      { expiresIn: FACE_CHALLENGE_TTL_SECONDS },
    );
  }

  private hasFaceEnrollment(
    user: Awaited<ReturnType<UsersService['findById']>> | Awaited<ReturnType<UsersService['findForLoginFresh']>>,
  ) {
    if (!user) {
      return false;
    }

    const enrolledSamples = this.faceBiometricService.deserializeStoredSamples(
      user.faceEmbeddingsJson,
    );
    return enrolledSamples.length > 0;
  }

  private buildFaceChallengeResponse(
    user: Awaited<ReturnType<UsersService['findById']>>,
  ) {
    const threshold = user.faceVerificationThreshold ?? DEFAULT_FACE_THRESHOLD;
    const faceEnrolled = this.hasFaceEnrollment(user);

    return {
      faceRequired: true,
      faceEnrolled,
      faceToken: this.createFaceChallenge(user.id),
      faceTokenExpiresIn: FACE_CHALLENGE_TTL_SECONDS,
      ...this.faceBiometricService.getEnrollmentGuidance(),
      threshold,
      message: faceEnrolled
        ? 'Capture the required face angles to continue login.'
        : 'This HIGH security account has no enrolled face vectors yet. Complete face enrollment first, then try login again.',
    };
  }

  private async resolveFaceSamples(
    faceSamples?: FaceEmbeddingSampleDto[],
    faceCaptures?: FaceCaptureDto[],
  ) {
    if (faceSamples?.length) {
      return this.faceBiometricService.normalizeSamples(faceSamples);
    }

    if (faceCaptures?.length) {
      return this.faceBiometricService.extractEmbeddingsFromCaptures(
        faceCaptures,
      );
    }

    throw new BadRequestException(
      'Provide either faceSamples or faceCaptures for face verification',
    );
  }

  private getSecurityLevelName(
    user: Awaited<ReturnType<UsersService['findById']>> | Awaited<ReturnType<UsersService['findForLoginFresh']>>,
  ) {
    return (user?.securityProfile?.name ?? '').toUpperCase();
  }

  private throwIfLocked(lockoutUntil?: Date | null) {
    if (!lockoutUntil) return;

    const remainingMs = lockoutUntil.getTime() - Date.now();
    if (remainingMs <= 0) return;

    const retryAfterSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
    throw new HttpException(
      {
        message: 'Too many failed login attempts. Please try again later.',
        retryAfterSeconds,
        lockoutUntil: lockoutUntil.toISOString(),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private getLockoutSecondsForAttempt(attempt: number): number | null {
    if (attempt === 4) return 30;
    if (attempt === 5) return 3 * 60;
    if (attempt === 6) return 5 * 60;
    if (attempt === 7) return 10 * 60;
    if (attempt === 8) return 30 * 60;
    if (attempt === 9) return 60 * 60;
    if (attempt >= 10) return 24 * 60 * 60;
    return null;
  }

  private throwLockedNow(lockoutUntil: Date, retryAfterSeconds: number) {
    throw new HttpException(
      {
        message: 'Too many failed login attempts. Please try again later.',
        retryAfterSeconds,
        lockoutUntil: lockoutUntil.toISOString(),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /* ================= REGISTER ================= */

  async register(dto: RegisterDto) {
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new BadRequestException('Email already exists');
    }

    const profile = await this.profilesService.getProfileByLevel(
      dto.securityLevel,
    );

    if (!profile) {
      throw new BadRequestException('Invalid security level');
    }

    const hashAlgo =
      profile.passwordStrategy === 'argon2id'
        ? HashAlgorithm.ARGON2ID
        : HashAlgorithm.BCRYPT;

    const passwordHash = await HashingUtil.hash(dto.password, hashAlgo);

    const user = await this.usersService.createUser(
      dto.email,
      passwordHash,
      hashAlgo,
      profile,
    );

    if (dto.securityLevel === 'HIGH') {
      const normalizedSamples = await this.resolveFaceSamples(
        dto.faceSamples,
        dto.faceCaptures,
      );
      this.faceBiometricService.validateEnrollmentSamples(normalizedSamples);
      user.faceEmbeddingsJson =
        this.faceBiometricService.serializeSamples(normalizedSamples);
      user.faceVerificationThreshold = DEFAULT_FACE_THRESHOLD;
      await this.usersService.save(user);
    }

    await this.auditService.log(AuthAction.REGISTER, user);

    return {
      id: user.id,
      email: user.email,
      profile: profile.name,
      faceEnrollmentCompleted:
        dto.securityLevel !== 'HIGH' || Boolean(user.faceEmbeddingsJson),
      createdAt: user.createdAt,
    };
  }

  /* ================= LOGIN ================= */

  async login(dto: LoginDto) {
    const user = await this.usersService.findForLoginFresh(dto.email);

    if (!user) {
      await this.auditService.log(AuthAction.LOGIN_FAILED);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.loginLockoutUntil && user.loginLockoutUntil.getTime() <= Date.now()) {
      await this.usersService.clearLoginLockout(user.id);
      user.loginLockoutUntil = null;
    }

    const expectedLockSeconds = this.getLockoutSecondsForAttempt(
      user.failedLoginAttempts ?? 0,
    );
    if (!expectedLockSeconds && user.loginLockoutUntil) {
      await this.usersService.clearLoginLockout(user.id);
      user.loginLockoutUntil = null;
    }

    this.throwIfLocked(user.loginLockoutUntil);


    const isValid = await HashingUtil.verify(
      user.passwordHash,
      dto.password,
      user.hashAlgorithm as HashAlgorithm,
    );

    if (!isValid) {
      await this.auditService.log(AuthAction.LOGIN_FAILED, user);
      const updated = await this.usersService.recordFailedLoginAttempt(user.id);
      if (updated.loginLockoutUntil && updated.lockoutSecondsApplied) {
        this.throwLockedNow(
          updated.loginLockoutUntil,
          updated.lockoutSecondsApplied,
        );
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    const securityLevel = this.getSecurityLevelName(user);

    if (securityLevel === 'HIGH') {
      const delivery = await this.issueEmailOtp(user.id, user.email, 'login');
      return {
        mfaRequired: true,
        mfaToken: this.createMfaChallenge(user.id),
        mfaType: 'email',
        mfaTokenExpiresIn: MFA_CHALLENGE_TTL_SECONDS,
        ...delivery,
      };
    }

    if (securityLevel === 'BALANCED') {
      return this.createCaptchaChallenge(user.id);
    }

    const authenticatedAt = new Date();
    await this.usersService.markLoginSuccess(user.id, authenticatedAt);
    user.lastAuthenticatedAt = authenticatedAt;

    const tokens = await this.buildAuthTokens(user);
    await this.auditService.log(AuthAction.LOGIN_SUCCESS, user);

    return {
      mfaRequired: false,
      ...tokens,
    };
  }

  async verifyTotpLogin(mfaToken: string, code: string) {
    let payload: { sub: string; purpose: string };
    try {
      payload = this.jwtService.verify(mfaToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired MFA token');
    }

    if (payload.purpose !== 'mfa-login') {
      throw new UnauthorizedException('Invalid MFA token');
    }

    const user = await this.usersService.findById(payload.sub);
    if (this.getSecurityLevelName(user) !== 'HIGH') {
      throw new UnauthorizedException('Email OTP login is only required for HIGH security accounts');
    }

    if (user.loginLockoutUntil && user.loginLockoutUntil.getTime() <= Date.now()) {
      await this.usersService.clearLoginLockout(user.id);
      user.loginLockoutUntil = null;
    }

    const expectedLockSeconds = this.getLockoutSecondsForAttempt(
      user.failedLoginAttempts ?? 0,
    );
    if (!expectedLockSeconds && user.loginLockoutUntil) {
      await this.usersService.clearLoginLockout(user.id);
      user.loginLockoutUntil = null;
    }

    this.throwIfLocked(user.loginLockoutUntil);

    try {
      await this.verifyEmailOtp(user.id, code, 'login');
    } catch {
      await this.auditService.log(AuthAction.LOGIN_FAILED, user);
      const updated = await this.usersService.recordFailedLoginAttempt(user.id);
      if (updated.loginLockoutUntil && updated.lockoutSecondsApplied) {
        this.throwLockedNow(
          updated.loginLockoutUntil,
          updated.lockoutSecondsApplied,
        );
      }
      throw new UnauthorizedException('Invalid email OTP code');
    }

    return this.createCaptchaChallenge(user.id);
  }

  async verifyCaptchaLogin(captchaId: string, code: string) {
    this.cleanupExpiredCaptchaChallenges();
    const challenge = this.captchaChallenges.get(captchaId);

    if (!challenge) {
      throw new UnauthorizedException('Invalid or expired captcha challenge');
    }

    this.captchaChallenges.delete(captchaId);

    const user = await this.usersService.findById(challenge.userId);
    if (user.loginLockoutUntil && user.loginLockoutUntil.getTime() <= Date.now()) {
      await this.usersService.clearLoginLockout(user.id);
      user.loginLockoutUntil = null;
    }

    const expectedLockSeconds = this.getLockoutSecondsForAttempt(
      user.failedLoginAttempts ?? 0,
    );
    if (!expectedLockSeconds && user.loginLockoutUntil) {
      await this.usersService.clearLoginLockout(user.id);
      user.loginLockoutUntil = null;
    }

    this.throwIfLocked(user.loginLockoutUntil);

    const expected = challenge.answer.toUpperCase();
    const actual = code.trim().toUpperCase();
    if (expected !== actual) {
      await this.auditService.log(AuthAction.LOGIN_FAILED, user);
      const updated = await this.usersService.recordFailedLoginAttempt(user.id);
      if (updated.loginLockoutUntil && updated.lockoutSecondsApplied) {
        this.throwLockedNow(
          updated.loginLockoutUntil,
          updated.lockoutSecondsApplied,
        );
      }
      throw new UnauthorizedException('Invalid captcha code');
    }

    if (this.getSecurityLevelName(user) === 'HIGH') {
      return {
        captchaRequired: false,
        ...this.buildFaceChallengeResponse(user),
      };
    }

    const authenticatedAt = new Date();
    await this.usersService.markLoginSuccess(user.id, authenticatedAt);
    user.lastAuthenticatedAt = authenticatedAt;

    const tokens = await this.buildAuthTokens(user);
    await this.auditService.log(AuthAction.LOGIN_SUCCESS, user);

    return {
      mfaRequired: false,
      captchaRequired: false,
      ...tokens,
    };
  }

  async verifyFaceLogin(
    faceToken: string,
    faceSamples?: FaceEmbeddingSampleDto[],
    faceCaptures?: FaceCaptureDto[],
  ) {
    let payload: { sub: string; purpose: string };
    try {
      payload = this.jwtService.verify(faceToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired face verification token');
    }

    if (payload.purpose !== 'face-login') {
      throw new UnauthorizedException('Invalid face verification token');
    }

    const user = await this.usersService.findById(payload.sub);
    if (this.getSecurityLevelName(user) !== 'HIGH') {
      throw new UnauthorizedException('Face verification is only required for HIGH security accounts');
    }

    const enrolledSamples = this.faceBiometricService.deserializeStoredSamples(
      user.faceEmbeddingsJson,
    );
    const normalizedLiveSamples = await this.resolveFaceSamples(
      faceSamples,
      faceCaptures,
    );

    const matchResult = this.faceBiometricService.matchEnrollment(
      enrolledSamples,
      normalizedLiveSamples,
      user.faceVerificationThreshold ?? DEFAULT_FACE_THRESHOLD,
    );

    if (!matchResult.matched) {
      await this.auditService.log(AuthAction.LOGIN_FAILED, user);
      const updated = await this.usersService.recordFailedLoginAttempt(user.id);
      if (updated.loginLockoutUntil && updated.lockoutSecondsApplied) {
        this.throwLockedNow(
          updated.loginLockoutUntil,
          updated.lockoutSecondsApplied,
        );
      }

      throw new UnauthorizedException({
        message: 'Face verification failed',
        averageScore: Number(matchResult.averageScore.toFixed(4)),
        matchedAngles: matchResult.matchedAngles,
        threshold: matchResult.threshold,
        scoresByAngle: matchResult.scoresByAngle,
      });
    }

    const authenticatedAt = new Date();
    await this.usersService.markLoginSuccess(user.id, authenticatedAt);
    user.lastAuthenticatedAt = authenticatedAt;

    const tokens = await this.buildAuthTokens(user);
    await this.auditService.log(AuthAction.LOGIN_SUCCESS, user);

    return {
      mfaRequired: false,
      faceRequired: false,
      averageScore: Number(matchResult.averageScore.toFixed(4)),
      matchedAngles: matchResult.matchedAngles,
      threshold: matchResult.threshold,
      ...tokens,
    };
  }

  async setupTotp(userId: string) {
    const user = await this.usersService.findById(userId);
    user.mfaEnabled = false;
    user.mfaSecretEncrypted = null;
    await this.usersService.save(user);

    const delivery = await this.issueEmailOtp(user.id, user.email, 'setup');

    return {
      ...delivery,
      message: 'We sent a 6-digit code to your email. Enter it to enable email OTP.',
    };
  }

  async enableTotp(userId: string, code: string) {
    const user = await this.usersService.findById(userId);
    await this.verifyEmailOtp(user.id, code, 'setup');

    user.mfaEnabled = true;
    user.mfaSecretEncrypted = null;
    await this.usersService.save(user);

    return {
      message: 'Email OTP enabled successfully',
      ...this.createCaptchaChallenge(user.id),
    };
  }

  async disableTotp(userId: string, code: string) {
    const user = await this.usersService.findById(userId);
    if (!user.mfaEnabled) {
      throw new BadRequestException('Email OTP is not enabled');
    }

    await this.verifyEmailOtp(user.id, code, 'disable');

    user.mfaEnabled = false;
    user.mfaSecretEncrypted = null;
    await this.usersService.save(user);

    return { message: 'Email OTP disabled successfully' };
  }

  async logout(userId: string) {
    const user = await this.usersService.findById(userId);

    await this.tokensService.revokeUserSessions(user.id);

    return { message: 'Logged out successfully' };
  }

  /* ================= REFRESH ================= */

  async refresh(rawRefreshToken: string) {
    const { userId, newRefreshToken } =
      await this.tokensService.rotateRefreshToken(rawRefreshToken);

    const user = await this.usersService.findById(userId);
    const profile = user.securityProfile;

    const newAccessToken = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role?.name ?? null,
      },
      { expiresIn: profile.accessTokenTTL },
    );

    await this.auditService.log(AuthAction.REFRESH_SUCCESS, user);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: profile.accessTokenTTL,
    };
  }

  /* ================= ADMIN REVOKE ================= */

  async revokeUserSessions(
    targetUserId: string,
    adminUserId: string,
  ): Promise<void> {
    const targetUser = await this.usersService.findById(targetUserId);
    const adminUser = await this.usersService.findById(adminUserId);

    if (!targetUser || !adminUser) {
      throw new BadRequestException('User not found');
    }

    await this.tokensService.revokeUserSessions(targetUser.id);

    await this.auditService.log(AuthAction.ADMIN_REVOKE, adminUser, targetUser);
  }

  /* ================= CHANGE PASSWORD ================= */

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.usersService.findById(userId);

    const valid = await HashingUtil.verify(
      user.passwordHash,
      currentPassword,
      user.hashAlgorithm as HashAlgorithm,
    );

    if (!valid) {
      throw new UnauthorizedException('Invalid current password');
    }

    const profile = user.securityProfile;
    const algo =
      profile.passwordStrategy === 'argon2id'
        ? HashAlgorithm.ARGON2ID
        : HashAlgorithm.BCRYPT;

    const newHash = await HashingUtil.hash(newPassword, algo);
    user.passwordHash = newHash;
    user.hashAlgorithm = algo;
    await this.usersService.save(user);

    await this.tokensService.revokeUserSessions(user.id);
    await this.auditService.log(AuthAction.PASSWORD_CHANGED, user);

    return { message: 'Password changed successfully' };
  }
}
