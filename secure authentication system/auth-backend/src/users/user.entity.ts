import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { SecurityProfile } from '../security-profiles/security-profile.entity';
import { Role } from 'src/roles/role.entity';

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  DISABLED = 'DISABLED',
}

export type FaceAngle = 'STRAIGHT' | 'LEFT' | 'RIGHT' | 'UP' | 'DOWN';

export type FaceEmbeddingSample = {
  angle: FaceAngle;
  vector: number[];
  capturedAt: string;
  qualityScore?: number | null;
};

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ name: 'hash_algorithm' })
  hashAlgorithm: string;

  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.ACTIVE,
  })
  status: UserStatus;

  @Column({ name: 'failed_login_attempts', type: 'int', default: 0 })
  failedLoginAttempts: number;

  @Column({ name: 'login_lockout_until', type: 'datetime', nullable: true })
  loginLockoutUntil?: Date | null;

  @Column({ name: 'last_authenticated_at', nullable: true })
  lastAuthenticatedAt?: Date;

  @Column({ name: 'mfa_enabled', default: false })
  mfaEnabled: boolean;

  @Column({ name: 'mfa_secret_encrypted', type: 'text', nullable: true })
  mfaSecretEncrypted?: string | null;

  @Column({ name: 'email_otp_hash', type: 'varchar', length: 64, nullable: true })
  emailOtpHash?: string | null;

  @Column({ name: 'email_otp_expires_at', type: 'datetime', nullable: true })
  emailOtpExpiresAt?: Date | null;

  @Column({ name: 'email_otp_purpose', type: 'varchar', length: 32, nullable: true })
  emailOtpPurpose?: string | null;

  @Column({ name: 'face_embeddings_json', type: 'longtext', nullable: true })
  faceEmbeddingsJson?: string | null;

  @Column({ name: 'face_verification_threshold', type: 'float', default: 0.78 })
  faceVerificationThreshold: number;

  @ManyToOne(() => SecurityProfile, { eager: true })
  securityProfile: SecurityProfile;

  @ManyToOne(() => Role, role => role.users, { eager: true, nullable: false })
  @JoinColumn({ name: 'role_id' })
  role: Role;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

