import {
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsIn,
  IsNotEmpty,
  IsString,
  Matches,
} from 'class-validator';

const ALLOWED_FACE_CAPTURE_ANGLES = [
  'STRAIGHT',
  'LEFT',
  'RIGHT',
  'UP',
  'DOWN',
] as const;

export class FaceCaptureDto {
  @IsIn(ALLOWED_FACE_CAPTURE_ANGLES)
  angle!: (typeof ALLOWED_FACE_CAPTURE_ANGLES)[number];

  @IsString()
  @IsNotEmpty()
  @Matches(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, {
    message: 'imageDataUrl must be a base64-encoded image data URL',
  })
  imageDataUrl!: string;

  @IsISO8601()
  capturedAt!: string;
}

export class FaceCaptureBatchDto {
  @IsArray()
  @ArrayMinSize(3)
  faceCaptures!: FaceCaptureDto[];
}
