import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersModule } from 'src/users/users.module';
import { SecurityProfilesModule } from 'src/security-profiles/security-profiles.module';
import { TokensModule } from 'src/tokens/tokens.module';
import { AuditModule } from 'src/audit/audit.module';
import { JwtSharedModule } from './jwt-shared.module';
import { FaceBiometricService } from './face-biometric.service';


@Module({
  imports: [
    UsersModule,
    SecurityProfilesModule,
    TokensModule,
    JwtModule.register({
      secret: 'super-secret-key', // move to env later
    }),
    AuditModule,
    JwtSharedModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, FaceBiometricService],
})
export class AuthModule {}
