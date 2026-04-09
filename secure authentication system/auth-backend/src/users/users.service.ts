import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserStatus } from './user.entity';
import { SecurityProfile } from 'src/security-profiles/security-profile.entity';
import { Role } from 'src/roles/role.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,

  ) {}

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

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email },
      relations: ['role', 'securityProfile'],
      select: {
        id: true,
        email: true,
        passwordHash: true,     
        hashAlgorithm: true,
        failedLoginAttempts: true,
        loginLockoutUntil: true,
        lastAuthenticatedAt: true,
        mfaEnabled: true,
        mfaSecretEncrypted: true,
        emailOtpHash: true,
        emailOtpExpiresAt: true,
        emailOtpPurpose: true,
        faceEmbeddingsJson: true,
        faceVerificationThreshold: true,
      },
    });
  }

  async   createUser(
    email: string,
    passwordHash: string,
    hashAlgorithm: string,
    profile: SecurityProfile,
  ): Promise<User> {

    // 1. Lấy role USER
    const userRole = await this.roleRepository.findOne({
      where: { name: 'USER' },
    });

    if (!userRole) {
      throw new Error('Default role USER not found');
    }

    // 2. Tạo user

    const user = this.userRepository.create({
      email,
      passwordHash,
      hashAlgorithm,
      securityProfile: profile,
      status: UserStatus.ACTIVE,
      role: userRole,
    });

    return this.userRepository.save(user);
  }

  async findById(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: {id},
      relations: ['role','securityProfile'],
    });

    if(!user){
      throw new NotFoundException('User not found');
    }

    return user;
  }
  async save(user: User) {
    return this.userRepository.save(user);
  }

  async findForLoginFresh(email: string): Promise<User | null> {
  return this.userRepository
    .createQueryBuilder('user')
    .leftJoinAndSelect('user.securityProfile', 'profile')
    .leftJoinAndSelect('user.role', 'role')
    .where('user.email = :email', { email })
    .select([
      'user.id',
      'user.email',
      'user.passwordHash',
      'user.hashAlgorithm',
      'user.failedLoginAttempts',
      'user.loginLockoutUntil',
      'user.lastAuthenticatedAt',
      'user.mfaEnabled',
      'user.mfaSecretEncrypted',
      'user.emailOtpHash',
      'user.emailOtpExpiresAt',
      'user.emailOtpPurpose',
      'user.faceEmbeddingsJson',
      'user.faceVerificationThreshold',
      'profile',
      'role',
    ])
    .getOne();
}

  async recordFailedLoginAttempt(userId: string): Promise<{
    failedLoginAttempts: number;
    loginLockoutUntil: Date | null;
    lockoutSecondsApplied: number | null;
  }> {
    return this.userRepository.manager.transaction(async (manager) => {
      const repo = manager.getRepository(User);

      const lockedUser = await repo.findOne({
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
        select: {
          id: true,
          failedLoginAttempts: true,
          loginLockoutUntil: true,
        },
      });

      if (!lockedUser) {
        throw new NotFoundException('User not found');
      }

      const nowMs = Date.now();
      const currentLockoutUntil = lockedUser.loginLockoutUntil ?? null;
      if (currentLockoutUntil && currentLockoutUntil.getTime() > nowMs) {
        return {
          failedLoginAttempts: lockedUser.failedLoginAttempts ?? 0,
          loginLockoutUntil: currentLockoutUntil,
          lockoutSecondsApplied: null,
        };
      }

      const nextAttempts = (lockedUser.failedLoginAttempts ?? 0) + 1;
      const lockoutSecondsApplied =
        this.getLockoutSecondsForAttempt(nextAttempts);
      const nextLockoutUntil = lockoutSecondsApplied
        ? new Date(nowMs + lockoutSecondsApplied * 1000)
        : null;

      await repo.update(
        { id: userId },
        {
          failedLoginAttempts: nextAttempts,
          loginLockoutUntil: nextLockoutUntil,
        },
      );

      return {
        failedLoginAttempts: nextAttempts,
        loginLockoutUntil: nextLockoutUntil,
        lockoutSecondsApplied,
      };
    });
  }

  async markLoginSuccess(userId: string, authenticatedAt: Date) {
    await this.userRepository.update(
      { id: userId },
      {
        failedLoginAttempts: 0,
        loginLockoutUntil: null,
        lastAuthenticatedAt: authenticatedAt,
      },
    );
  }

  async clearLoginLockout(userId: string) {
    await this.userRepository.update(
      { id: userId },
      {
        loginLockoutUntil: null,
      },
    );
  }

}
