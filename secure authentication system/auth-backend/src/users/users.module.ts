import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { JwtSharedModule } from 'src/auth/jwt-shared.module';


import { User } from './user.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { Role } from 'src/roles/role.entity';


@Module({
  imports: [
    TypeOrmModule.forFeature([User, Role]),
    JwtModule.register({
      secret: 'super-secret-key', 
    }),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
