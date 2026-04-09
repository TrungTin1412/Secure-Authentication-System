import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyLoginCaptchaDto {
  @IsString()
  @IsNotEmpty()
  captchaId!: string;

  @IsString()
  @IsNotEmpty()
  code!: string;
}
