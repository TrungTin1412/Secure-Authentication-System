import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsIn,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

const ALLOWED_FACE_ANGLES = ['STRAIGHT', 'LEFT', 'RIGHT', 'UP', 'DOWN'] as const;

export class FaceEmbeddingSampleDto {
  @IsIn(ALLOWED_FACE_ANGLES)
  angle!: (typeof ALLOWED_FACE_ANGLES)[number];

  @IsArray()
  @ArrayMinSize(32)
  @ArrayMaxSize(1024)
  @IsNumber(
    { allowNaN: false, allowInfinity: false },
    { each: true },
  )
  vector!: number[];

  @IsISO8601()
  capturedAt!: string;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(1)
  qualityScore?: number;
}

export const FACE_ANGLES = ALLOWED_FACE_ANGLES;
