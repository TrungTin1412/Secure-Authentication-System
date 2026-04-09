import { IsString, Length } from 'class-validator';

export class OtpCodeDto {
  @IsString()
  @Length(6, 6)
  code!: string;
}
