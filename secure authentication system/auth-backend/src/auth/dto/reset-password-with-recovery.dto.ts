import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';

export class ResetPasswordWithRecoveryDto {
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  recoveryPhrase!: string;

  @IsNotEmpty()
  @MinLength(8)
  newPassword!: string;
}
