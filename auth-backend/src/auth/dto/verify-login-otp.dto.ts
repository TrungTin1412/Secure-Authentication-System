import { IsNotEmpty, IsString, Length } from 'class-validator';

export class VerifyLoginotpDto {
  @IsString()
  @IsNotEmpty()
  mfaToken!: string;

  @IsString()
  @Length(6, 6)
  code!: string;
}
