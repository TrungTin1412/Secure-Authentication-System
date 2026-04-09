import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { FaceEmbeddingSampleDto } from './face-embedding-sample.dto';
import { FaceCaptureDto } from './face-capture.dto';

export class VerifyLoginFaceDto {
  @IsString()
  @IsNotEmpty()
  faceToken!: string;

  @ArrayMinSize(3)
  @ValidateNested({ each: true })
  @Type(() => FaceEmbeddingSampleDto)
  @IsOptional()
  faceSamples?: FaceEmbeddingSampleDto[];

  @IsOptional()
  @ArrayMinSize(3)
  @ValidateNested({ each: true })
  @Type(() => FaceCaptureDto)
  faceCaptures?: FaceCaptureDto[];
}
