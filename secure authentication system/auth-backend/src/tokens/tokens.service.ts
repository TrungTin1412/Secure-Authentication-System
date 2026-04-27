import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RefreshToken } from './refresh-token.entity';
import { User } from 'src/users/user.entity';
import { UnauthorizedException } from '@nestjs/common';
import { AuditService } from 'src/audit/audit.service';
import { AuthAction } from 'src/audit/auth-log.entity';
import * as crypto from 'crypto';

@Injectable()
export class TokensService {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly auditService: AuditService,
  ) {}

  async createRefreshToken(
    user: User,
    ttlSeconds: number,
  ): Promise<string> {
    const rawToken = crypto.randomBytes(64).toString('hex');
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    const familyId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    const refreshToken = this.refreshTokenRepository.create({
      user,
      tokenHash,
      familyId,
      expiresAt,
    });

    await this.refreshTokenRepository.save(refreshToken);

    return rawToken;
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async revokeTokenFamily(familyId: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { familyId },
      {
        revokedAt: new Date(),
      },
    );
  }


  async rotateRefreshToken(
    rawToken: string,
  ): Promise<{ userId: string; newRefreshToken: string }> {
    if (typeof rawToken !== 'string' || !rawToken.trim()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    const existingToken = await this.refreshTokenRepository.findOne({
      where: { tokenHash },
      relations: ['user'],
    });

    if (!existingToken) {
      await this.auditService.log(
        AuthAction.REFRESH_REUSE,
        undefined,
      );
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (existingToken.reused || existingToken.revokedAt) {
      await this.revokeTokenFamily(existingToken.familyId);

      await this.auditService.log(
        AuthAction.REFRESH_REUSE,
        existingToken.user,
      );

      throw new UnauthorizedException('Refresh token reuse detected');
    }

    existingToken.reused = true;
    existingToken.revokedAt = new Date();
    await this.refreshTokenRepository.save(existingToken);

    const newRawToken = crypto.randomBytes(64).toString('hex');
    const newTokenHash = this.hashToken(newRawToken);

    const expiresAt = new Date(
      Date.now() +
        (existingToken.expiresAt.getTime() - existingToken.createdAt.getTime()),
    );

    const newToken = this.refreshTokenRepository.create({
      user: existingToken.user,
      tokenHash: newTokenHash,
      familyId: existingToken.familyId,
      expiresAt,
    });

    await this.refreshTokenRepository.save(newToken);

    return {
      userId: existingToken.user.id,
      newRefreshToken: newRawToken,
    };
  }

  async revokeUserSessions(userId: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { user: { id: userId } },
      { revokedAt: new Date() },
    );
  }


}
