import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthLog } from './auth-log.entity';
import { AuthAction } from './auth-log.entity';
import { User } from 'src/users/user.entity';


@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuthLog)
    private readonly repo: Repository<AuthLog>, 
  ) {}

  async log(
    action: AuthAction,
    actor?: User,
    target?: User,
  ): Promise<void> {
    const log = this.repo.create({
      action,
      user: actor,
      targetUser: target, 
    });

    await this.repo.save(log);
  }

  async findLogsForUser(userId: string, limit = 20) {
    return this.repo.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async findLogsForNonAdminUsers(limit = 100) {
    const adminRelevantActions = [
      AuthAction.LOGIN_SUCCESS,
      AuthAction.LOGIN_FAILED,
      AuthAction.REGISTER,
      AuthAction.REFRESH_REUSE,
      AuthAction.ADMIN_REVOKE,
    ];

    return this.repo
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.user', 'user')
      .leftJoinAndSelect('user.role', 'role')
      .where('role.name != :admin', { admin: 'ADMIN' })
      .andWhere('log.action IN (:...actions)', {
        actions: adminRelevantActions,
      })
      .orderBy('log.createdAt', 'DESC')
      .limit(limit)
      .getMany();
  }
}
