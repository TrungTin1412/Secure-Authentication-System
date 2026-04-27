import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from 'src/users/user.entity';

@Entity('refresh_tokens')
@Index(['user', 'familyId'])
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, {
    onDelete: 'CASCADE',
  })
  user!: User;

  @Column({ name: 'token_hash' })
  tokenHash!: string;

  @Column({ name: 'family_id' })
  familyId!: string;

  @Column({ name: 'expires_at' })
  expiresAt!: Date;

  @Column({ 
    name: 'revoked_at', 
    type: 'datetime',
    nullable: true 
  })
  revokedAt!: Date | null;

  @Column({ default: false })
  reused!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
