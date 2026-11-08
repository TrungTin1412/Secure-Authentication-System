import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SecurityProfile } from './security-profile.entity';

@Injectable()
export class SecurityProfilesService {
  constructor(
    @InjectRepository(SecurityProfile)
    private readonly profileRepository: Repository<SecurityProfile>,
  ) {}

  async getDefaultProfile(): Promise<SecurityProfile> {
    const profile = await this.profileRepository.findOne({
      where: { name: 'Balanced' },
    });

    if (!profile) {
      throw new NotFoundException('Default security profile not found');
    }

    return profile;
  }

  async getProfileByLevel(level: string): Promise<SecurityProfile> {
    const profile = await this.profileRepository.findOne({
      where: { name: level},
    });

    if(!profile){
      throw new NotFoundException('Security is not found!');
    }

    return profile;
  }

}
