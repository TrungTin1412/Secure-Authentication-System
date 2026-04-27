import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { User } from 'src/users/user.entity';

export enum AuthAction {
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILED = 'LOGIN_FAILED',
  REFRESH_SUCCESS = 'REFRESH_SUCCESS',
  REFRESH_REUSE = 'REFRESH_REUSE',
  ADMIN_REVOKE = 'ADMIN_REVOKE',
  REGISTER = 'REGISTER' ,
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',
}

@Entity('auth_logs')
export class AuthLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    type: 'enum',
    enum: AuthAction,
  })
  action!: AuthAction;

  @ManyToOne(() => User, { nullable: true })
  user?: User;

  @ManyToOne(() => User, { nullable: true })
  targetUser?: User;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ nullable: true })
  ipAddress?: string;

  @Column({ nullable: true })
  userAgent?: string;
}
