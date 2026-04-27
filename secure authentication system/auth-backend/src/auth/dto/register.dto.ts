import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { FaceEmbeddingSampleDto } from './face-embedding-sample.dto';
import { FaceCaptureDto } from './face-capture.dto';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  @MinLength(8)
  password!: string;

  @IsNotEmpty()
  @MinLength(12)
  recoveryPhrase!: string;

  @IsIn(['BASIC', 'BALANCED', 'HIGH'])
  securityLevel!: 'BASIC' | 'BALANCED' | 'HIGH';

  @IsOptional()
  @ArrayMinSize(3)
  @ValidateNested({ each: true })
  @Type(() => FaceEmbeddingSampleDto)
  faceSamples?: FaceEmbeddingSampleDto[];

  @IsOptional()
  @ArrayMinSize(3)
  @ValidateNested({ each: true })
  @Type(() => FaceCaptureDto)
  faceCaptures?: FaceCaptureDto[];
}
