import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecurityProfile } from './security-profile.entity';
import { SecurityProfilesService } from './security-profiles.service';

@Module({
  imports: [TypeOrmModule.forFeature([SecurityProfile])],
  providers: [SecurityProfilesService],
  exports: [SecurityProfilesService],
})
export class SecurityProfilesModule {}
