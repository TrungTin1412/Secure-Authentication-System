import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshToken } from './refresh-token.entity';
import { TokensService } from './tokens.service';
import { AuditModule } from 'src/audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RefreshToken]),
    AuditModule, 
  ],
  providers: [TokensService],
  exports: [TokensService],
})
export class TokensModule {}
