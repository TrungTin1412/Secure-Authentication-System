import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { JwtGuard } from 'src/common/guards/jwt.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';

@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @UseGuards(JwtGuard)
  @Get('me')
    async getMyLogs(@Req() req) {
    const userId = req.user.sub;
    const logs = await this.auditService.findLogsForUser(userId);

    return logs.map((log) => ({
      action: log.action,
      createdAt: log.createdAt,
      ipAddress: log.ipAddress ?? null,
      userAgent: log.userAgent ?? null,
    }));
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('admin')
    async getAllUserLogs() {
    const logs = await this.auditService.findLogsForNonAdminUsers();

    return logs
    .filter(
      (log): log is typeof log & {
        user: NonNullable<typeof log.user>;
      } =>
        log.user !== null,
    )
    .map((log) => {
      const target = log.targetUser ?? log.user;

      return {
        action: log.action,
        createdAt: log.createdAt,
        userId: target.id,
        email: target.email,
      };
    });

  }
}
