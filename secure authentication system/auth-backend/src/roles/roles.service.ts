import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from './role.entity';

@Injectable()
export class RolesService implements OnModuleInit {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
  ) {}

  async onModuleInit() {
    await this.ensureDefaults();
  }

  private async ensureDefaults() {
    const defaultRoles = ['USER', 'ADMIN'];

    for (const name of defaultRoles) {
      const existing = await this.roleRepository.findOne({ where: { name } });
      if (!existing) {
        await this.roleRepository.save(this.roleRepository.create({ name }));
      }
    }
  }
}
