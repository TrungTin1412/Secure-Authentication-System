import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { JwtGuard } from 'src/common/guards/jwt.guard';

@Controller('users')
export class UsersController {
  @UseGuards(JwtGuard)
  @Get('me')
  getMe(@Req() req) {
    const user = req.user; 
      return {
        userId: user.sub,
        email: user.email,
        role: user.role,
        securityLevel: user.securityProfile?.name,
      };
    }
}
