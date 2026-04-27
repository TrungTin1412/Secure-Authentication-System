import { Controller, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyLoginotpDto } from './dto/verify-login-otp.dto';
import { VerifyLoginCaptchaDto } from './dto/verify-login-captcha.dto';
import { RefreshLoginCaptchaDto } from './dto/refresh-login-captcha.dto';
import { VerifyLoginFaceDto } from './dto/verify-login-face.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordWithRecoveryDto } from './dto/reset-password-with-recovery.dto';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { JwtGuard } from 'src/common/guards/jwt.guard';
import { Roles } from 'src/common/decorators/roles.decorator';


@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('login/otp_email')
  async verifyLoginOtpEmail(@Body() dto: VerifyLoginotpDto) {
    return this.authService.verifyOtpLogin(dto.mfaToken, dto.code);
  }

  @Post('login/captcha')
  async verifyLoginCaptcha(@Body() dto: VerifyLoginCaptchaDto) {
    return this.authService.verifyCaptchaLogin(dto.captchaId, dto.code);
  }

  @Post('login/face')
  async verifyLoginFace(@Body() dto: VerifyLoginFaceDto) {
    return this.authService.verifyFaceLogin(
      dto.faceToken,
      dto.faceSamples,
      dto.faceCaptures,
    );
  }

  @Post('login/captcha/refresh')
  async refreshLoginCaptcha(@Body() dto: RefreshLoginCaptchaDto) {
    return this.authService.refreshCaptchaChallenge(dto.captchaId);
  }

  @Post('forgot-password/request')
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto, @Req() req) {
    return this.authService.requestPasswordReset(dto.email, req.ip);
  }

  @Post('forgot-password/reset')
  async resetPasswordWithRecovery(
    @Body() dto: ResetPasswordWithRecoveryDto,
    @Req() req,
  ) {
    return this.authService.resetPasswordWithRecovery(
      dto.email,
      dto.recoveryPhrase,
      dto.newPassword,
      req.ip,
    );
  }

  @Post('refresh')
  async refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refresh(refreshToken);
  }

  @UseGuards(JwtGuard)
  @Post('logout')
  async logout(@Req() req) {
    return this.authService.logout(req.user.sub);
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('admin/revoke-user/:userId')
  async revokeUser(
    @Param('userId') userId: string,
    @Req() req,
  ) {
    await this.authService.revokeUserSessions(
      userId,
      req.user.sub, // admin id
    );

    return { message: 'User sessions revoked' };
  }

  @UseGuards(JwtGuard)
  @Post('change-password')
  async changePassword(
    @Req() req,
    @Body() dto: {
      currentPassword: string;
      newPassword: string;
    },
  ) {
    return this.authService.changePassword(
      req.user.sub,
      dto.currentPassword,
      dto.newPassword,
    );
  }


}
