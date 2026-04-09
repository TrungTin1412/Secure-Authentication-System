import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  FaceAngle,
  FaceEmbeddingSample,
} from 'src/users/user.entity';
import {
  FACE_ANGLES,
  FaceEmbeddingSampleDto,
} from './dto/face-embedding-sample.dto';
import { FaceCaptureDto } from './dto/face-capture.dto';

const REQUIRED_FACE_ANGLES: FaceAngle[] = ['STRAIGHT', 'LEFT', 'RIGHT'];
const DEFAULT_FACE_THRESHOLD = 0.78;
const MINIMUM_PASSING_ANGLES = 3;

type FaceMatchResult = {
  matched: boolean;
  threshold: number;
  averageScore: number;
  matchedAngles: FaceAngle[];
  scoresByAngle: Partial<Record<FaceAngle, number>>;
};

@Injectable()
export class FaceBiometricService {
  async extractEmbeddingsFromCaptures(
    captures: FaceCaptureDto[],
  ): Promise<FaceEmbeddingSample[]> {
    if (!captures?.length) {
      throw new BadRequestException('Face captures are required');
    }

    const serviceUrl = process.env.ARCFACE_SERVICE_URL;
    if (!serviceUrl) {
      throw new InternalServerErrorException(
        'ARCFACE_SERVICE_URL is not configured',
      );
    }

    let response: Response;
    try {
      response = await fetch(`${serviceUrl}/embed-batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          samples: captures.map((capture) => ({
            angle: capture.angle,
            imageDataUrl: capture.imageDataUrl,
            capturedAt: capture.capturedAt,
          })),
        }),
      });
    } catch {
      throw new InternalServerErrorException(
        'Unable to connect to the ArcFace embedding service',
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new InternalServerErrorException(
        'ArcFace embedding service returned an invalid response',
      );
    }

    if (!response.ok) {
      const message =
        typeof payload === 'object' &&
        payload !== null &&
        'detail' in payload &&
        typeof (payload as { detail?: unknown }).detail === 'string'
          ? (payload as { detail: string }).detail
          : 'ArcFace embedding service failed to process the captures';

      throw new BadRequestException(message);
    }

    if (!Array.isArray(payload)) {
      throw new InternalServerErrorException(
        'ArcFace embedding service returned an unexpected payload',
      );
    }

    return this.normalizeSamples(payload as FaceEmbeddingSampleDto[]);
  }

  normalizeSamples(samples: FaceEmbeddingSampleDto[]): FaceEmbeddingSample[] {
    if (!samples?.length) {
      throw new BadRequestException('Face samples are required');
    }

    const normalized = samples.map((sample) => {
      if (!sample.vector?.length) {
        throw new BadRequestException('Each face sample must include an embedding vector');
      }

      return {
        angle: sample.angle,
        vector: sample.vector.map((value) => Number(value)),
        capturedAt: sample.capturedAt,
        qualityScore: sample.qualityScore ?? null,
      };
    });

    const vectorLength = normalized[0].vector.length;
    for (const sample of normalized) {
      if (sample.vector.length !== vectorLength) {
        throw new BadRequestException('All face vectors must use the same dimension');
      }
    }

    return normalized;
  }

  validateEnrollmentSamples(samples: FaceEmbeddingSample[]) {
    if (samples.length < MINIMUM_PASSING_ANGLES) {
      throw new BadRequestException('At least three face samples are required');
    }

    this.ensureRequiredAngles(samples);
  }

  deserializeStoredSamples(faceEmbeddingsJson?: string | null): FaceEmbeddingSample[] {
    if (!faceEmbeddingsJson) {
      return [];
    }

    try {
      const parsed = JSON.parse(faceEmbeddingsJson) as FaceEmbeddingSample[];
      if (!Array.isArray(parsed)) {
        throw new Error('Expected array');
      }

      return parsed;
    } catch {
      throw new BadRequestException('Stored face enrollment data is invalid');
    }
  }

  serializeSamples(samples: FaceEmbeddingSample[]) {
    return JSON.stringify(samples);
  }

  matchEnrollment(
    enrolledSamples: FaceEmbeddingSample[],
    liveSamples: FaceEmbeddingSample[],
    threshold = DEFAULT_FACE_THRESHOLD,
  ): FaceMatchResult {
    if (!enrolledSamples.length) {
      throw new UnauthorizedException('Face verification is not enrolled for this account');
    }

    this.ensureRequiredAngles(enrolledSamples);
    this.ensureRequiredAngles(liveSamples);

    const scoresByAngle: Partial<Record<FaceAngle, number>> = {};

    for (const angle of REQUIRED_FACE_ANGLES) {
      const enrolledForAngle = enrolledSamples.filter((sample) => sample.angle === angle);
      const liveForAngle = liveSamples.filter((sample) => sample.angle === angle);

      if (!enrolledForAngle.length || !liveForAngle.length) {
        continue;
      }

      let bestScore = -1;
      for (const enrolled of enrolledForAngle) {
        for (const live of liveForAngle) {
          const score = this.cosineSimilarity(enrolled.vector, live.vector);
          if (score > bestScore) {
            bestScore = score;
          }
        }
      }

      scoresByAngle[angle] = bestScore;
    }

    const matchedAngles = REQUIRED_FACE_ANGLES.filter(
      (angle) => (scoresByAngle[angle] ?? -1) >= threshold,
    );

    const scoreValues = Object.values(scoresByAngle).filter(
      (score): score is number => typeof score === 'number',
    );
    const averageScore =
      scoreValues.length > 0
        ? scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length
        : 0;

    return {
      matched:
        matchedAngles.length >= MINIMUM_PASSING_ANGLES &&
        averageScore >= threshold,
      threshold,
      averageScore,
      matchedAngles,
      scoresByAngle,
    };
  }

  getEnrollmentGuidance() {
    return {
      requiredAngles: REQUIRED_FACE_ANGLES,
      acceptedAngles: FACE_ANGLES,
      minimumSamples: MINIMUM_PASSING_ANGLES,
      recommendedSamples: 5,
      threshold: DEFAULT_FACE_THRESHOLD,
    };
  }

  private ensureRequiredAngles(samples: FaceEmbeddingSample[]) {
    const seenAngles = new Set(samples.map((sample) => sample.angle));
    const missingAngles = REQUIRED_FACE_ANGLES.filter((angle) => !seenAngles.has(angle));

    if (missingAngles.length > 0) {
      throw new BadRequestException(
        `Face samples must include angles: ${REQUIRED_FACE_ANGLES.join(', ')}`,
      );
    }
  }

  private cosineSimilarity(a: number[], b: number[]) {
    if (a.length !== b.length) {
      throw new BadRequestException('Face vector dimensions do not match');
    }

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let index = 0; index < a.length; index += 1) {
      dotProduct += a[index] * b[index];
      magnitudeA += a[index] * a[index];
      magnitudeB += b[index] * b[index];
    }

    if (magnitudeA === 0 || magnitudeB === 0) {
      throw new BadRequestException('Face vectors must not be zero vectors');
    }

    return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
  }
}

export {
  DEFAULT_FACE_THRESHOLD,
  MINIMUM_PASSING_ANGLES,
  REQUIRED_FACE_ANGLES,
};
