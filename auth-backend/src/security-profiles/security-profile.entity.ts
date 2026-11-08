import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum PasswordStrategy {
  ARGON2ID = 'argon2id',
  BCRYPT = 'bcrypt',
}

export enum RefreshStrategy {
  SIMPLE = 'simple',
  ROTATION = 'rotation',
  ROTATION_REUSE = 'rotation_reuse',
}

@Entity('security_profiles')
export class SecurityProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  name!: string;
  // Basic, Balanced, High

  @Column({ name: 'password_strategy' })
  passwordStrategy!: PasswordStrategy;

  @Column({ name: 'refresh_strategy' })
  refreshStrategy!: RefreshStrategy;

  @Column({ name: 'access_token_ttl' })
  accessTokenTTL!: number; // seconds

  @Column({ name: 'refresh_token_ttl' })
  refreshTokenTTL!: number; // seconds

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
