import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshLoginCaptchaDto {
  @IsString()
  @IsNotEmpty()
  captchaId!: string;
}
