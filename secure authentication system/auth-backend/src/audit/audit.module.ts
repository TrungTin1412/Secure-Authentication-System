import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthLog } from './auth-log.entity';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { JwtSharedModule } from 'src/auth/jwt-shared.module';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuthLog]),
    JwtSharedModule, 
    UsersModule,
  ],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService], 
})
export class AuditModule {}
