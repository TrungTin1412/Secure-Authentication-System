import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';


import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SecurityProfilesModule } from './security-profiles/security-profiles.module';
import { TokensModule } from './tokens/tokens.module';
import { RolesModule } from './roles/roles.module';
import { AuditModule } from './audit/audit.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal:true,
    }),
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: 'localhost',
      port: 3307, 
      username: 'auth_user',
      password: 'auth_pass',
      database: 'auth_db',
      timezone: 'Z',
      autoLoadEntities: true,
      synchronize: false,
    }),

    AuthModule,
    UsersModule,
    SecurityProfilesModule,
    TokensModule,
    RolesModule,
    AuditModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
