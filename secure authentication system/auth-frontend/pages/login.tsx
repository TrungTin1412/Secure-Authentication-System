import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import styles from './login.module.css';
import { type ApiError, type LockoutError } from '@/lib/api';
import {
  login,
  verifyLoginTotp,
  verifyLoginCaptcha,
  verifyLoginFace,
  refreshLoginCaptcha,
} from '@/lib/auth';

type LoginStage =
  | 'credentials'
  | 'verify_email_otp'
  | 'verify_captcha'
  | 'verify_face';

type CaptureAngle = 'STRAIGHT' | 'LEFT' | 'RIGHT' | 'UP' | 'DOWN';
type CapturedPhoto = {
  angle: CaptureAngle;
  dataUrl: string;
  capturedAt: string;
};
type FaceMatchDetails = {
  averageScore?: number;
  threshold?: number;
  matchedAngles?: string[];
  scoresByAngle?: Record<string, number>;
  status: 'success' | 'failed';
};

const FACE_CAPTURE_ANGLES: CaptureAngle[] = [
  'STRAIGHT',
  'LEFT',
  'RIGHT',
  'UP',
  'DOWN',
];

const ANGLE_INSTRUCTIONS: Record<CaptureAngle, string> = {
  STRAIGHT: 'Look straight at the camera.',
  LEFT: 'Turn your face slightly to the left.',
  RIGHT: 'Turn your face slightly to the right.',
  UP: 'Lift your chin slightly upward.',
  DOWN: 'Lower your chin slightly downward.',
};

function toFaceCaptures(photos: CapturedPhoto[]) {
  return photos.map((photo) => ({
    angle: photo.angle,
    imageDataUrl: photo.dataUrl,
    capturedAt: photo.capturedAt,
  }));
}

function extractFaceMatchDetails(data: any) {
  const source =
    data && typeof data?.message === 'object' && data.message !== null
      ? data.message
      : data;

  if (!source || typeof source !== 'object') {
    return null;
  }

  const hasFaceMetrics =
    'averageScore' in source ||
    'threshold' in source ||
    'matchedAngles' in source ||
    'scoresByAngle' in source;

  if (!hasFaceMetrics) {
    return null;
  }

  return {
    averageScore:
      typeof source.averageScore === 'number' ? source.averageScore : undefined,
    threshold:
      typeof source.threshold === 'number' ? source.threshold : undefined,
    matchedAngles: Array.isArray(source.matchedAngles)
      ? source.matchedAngles
      : [],
    scoresByAngle:
      source.scoresByAngle && typeof source.scoresByAngle === 'object'
        ? source.scoresByAngle
        : {},
  };
}

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [captchaCode, setCaptchaCode] = useState('');
  const [stage, setStage] = useState<LoginStage>('credentials');
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [deliveryEmail, setDeliveryEmail] = useState<string | null>(null);
  const [captchaId, setCaptchaId] = useState<string | null>(null);
  const [captchaImageDataUrl, setCaptchaImageDataUrl] = useState<string | null>(
    null,
  );
  const [faceToken, setFaceToken] = useState<string | null>(null);
  const [faceEnrolled, setFaceEnrolled] = useState(true);
  const [faceThreshold, setFaceThreshold] = useState<number | null>(null);
  const [facePromptMessage, setFacePromptMessage] = useState<string | null>(null);
  const [faceSamplesJson, setFaceSamplesJson] = useState('');
  const [capturedPhotos, setCapturedPhotos] = useState<CapturedPhoto[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [faceMatchDetails, setFaceMatchDetails] =
    useState<FaceMatchDetails | null>(null);
  const [faceVerificationPassed, setFaceVerificationPassed] = useState(false);
  const [lockoutEndsAt, setLockoutEndsAt] = useState<number | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState<number | null>(null);
  const [lockoutBaseMessage, setLockoutBaseMessage] = useState<string | null>(
    null,
  );

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (router.query.registered) {
      setMessage('Registration successful. Please login.');
    }
  }, [router.query]);

  useEffect(() => {
    if (!lockoutEndsAt) return;

    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((lockoutEndsAt - Date.now()) / 1000),
      );
      setLockoutSeconds(remaining);
      if (remaining <= 0) {
        setLockoutEndsAt(null);
        setLockoutSeconds(null);
        setLockoutBaseMessage(null);
      }
    };

    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [lockoutEndsAt]);

  useEffect(() => {
    if (stage !== 'verify_face') {
      stopCamera();
      setCameraOpen(false);
      return;
    }

    if (faceEnrolled) {
      setCameraOpen(true);
    }
  }, [stage, faceEnrolled]);

  useEffect(() => {
    if (!cameraOpen || typeof navigator === 'undefined') {
      return;
    }

    let cancelled = false;

    const startCamera = async () => {
      try {
        setCameraError(null);
        setCameraReady(false);

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          return;
        }

        video.srcObject = stream;
        await video.play();
        setCameraReady(true);
      } catch {
        setCameraError(
          'Unable to access the camera. Please allow permission and try again.',
        );
      }
    };

    void startCamera();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [cameraOpen]);

  const isLocked = lockoutSeconds !== null && lockoutSeconds > 0;
  const nextRequiredAngle = useMemo(
    () =>
      FACE_CAPTURE_ANGLES.find(
        (angle) => !capturedPhotos.some((photo) => photo.angle === angle),
      ) ?? null,
    [capturedPhotos],
  );

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraReady(false);
  }

  function formatSeconds(totalSeconds: number) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes <= 0) return `${seconds}s`;
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  }

  function applyLockout(err: LockoutError) {
    const seconds = Math.max(1, Math.ceil(err.retryAfterSeconds || 0));
    const endsAt = Date.now() + seconds * 1000;
    setLockoutEndsAt(endsAt);
    setLockoutSeconds(seconds);
    setLockoutBaseMessage(err.message);
    setError(null);
  }

  function beginFaceStep(res: {
    faceToken: string;
    faceEnrolled: boolean;
    threshold: number;
    message?: string;
  }) {
    setFaceToken(res.faceToken);
    setFaceEnrolled(res.faceEnrolled);
    setFaceThreshold(res.threshold);
    setFacePromptMessage(
      res.message ??
        (res.faceEnrolled
          ? 'Take the requested face photos to continue.'
          : 'Face enrollment vectors are missing for this account.'),
    );
    setFaceSamplesJson('');
    setCapturedPhotos([]);
    setCameraError(null);
    setFaceMatchDetails(null);
    setFaceVerificationPassed(false);
    setStage('verify_face');
    setMessage(null);
  }

  function applyFaceMatchDetails(
    payload: {
      averageScore?: number;
      threshold?: number;
      matchedAngles?: string[];
      scoresByAngle?: Record<string, number>;
    },
    status: 'success' | 'failed',
  ) {
    setFaceMatchDetails({
      averageScore: payload.averageScore,
      threshold: payload.threshold,
      matchedAngles: payload.matchedAngles ?? [],
      scoresByAngle: payload.scoresByAngle ?? {},
      status,
    });
  }

  function capturePhoto() {
    if (!nextRequiredAngle) {
      return;
    }

    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setCameraError('The camera preview is not ready yet.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');

    if (!context) {
      setCameraError('Unable to capture the frame.');
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    setCapturedPhotos((current) => [
      ...current.filter((photo) => photo.angle !== nextRequiredAngle),
      {
        angle: nextRequiredAngle,
        dataUrl,
        capturedAt: new Date().toISOString(),
      },
    ]);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const res = await login(email, password);

      if ('mfaRequired' in res && res.mfaRequired) {
        setStage('verify_email_otp');
        setMfaToken(res.mfaToken);
        setDeliveryEmail(res.email ?? null);
        setMessage(`Enter the 6-digit code sent to ${res.email}.`);
        return;
      }

      if ('captchaRequired' in res && res.captchaRequired) {
        setCaptchaId(res.captchaId);
        setCaptchaImageDataUrl(res.captchaImageDataUrl ?? null);
        setCaptchaCode('');
        setStage('verify_captcha');
        setMessage('Enter the captcha to continue login.');
        return;
      }

      if ('faceRequired' in res && res.faceRequired) {
        beginFaceStep(res);
        return;
      }

      router.push('/dashboard');
    } catch (err: any) {
      if (err?.type === 'LOCKOUT') {
        applyLockout(err as LockoutError);
      } else {
        setError(err.message || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtpEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!mfaToken) {
        throw new Error('Missing MFA token. Please login again.');
      }

      const res = await verifyLoginTotp(mfaToken, otpCode);

      if ('captchaRequired' in res && res.captchaRequired) {
        setCaptchaId(res.captchaId);
        setCaptchaImageDataUrl(res.captchaImageDataUrl ?? null);
        setCaptchaCode('');
        setStage('verify_captcha');
        setMessage('Enter the captcha to finish login.');
        return;
      }

      if ('faceRequired' in res && res.faceRequired) {
        beginFaceStep(res);
        return;
      }

      router.push('/dashboard');
    } catch (err: any) {
      if (err?.type === 'LOCKOUT') {
        applyLockout(err as LockoutError);
      } else {
        setError(err.message || 'Email OTP verification failed');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCaptcha(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!captchaId) {
        throw new Error('Missing captcha challenge. Please login again.');
      }

      const res = await verifyLoginCaptcha(captchaId, captchaCode);
      if ('faceRequired' in res && res.faceRequired) {
        beginFaceStep(res);
        return;
      }

      router.push('/dashboard');
    } catch (err: any) {
      if (err?.type === 'LOCKOUT') {
        applyLockout(err as LockoutError);
      } else {
        setError(err.message || 'Captcha verification failed');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyFace(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!faceToken) {
        throw new Error('Missing face verification token. Please login again.');
      }

      stopCamera();
      setCameraOpen(false);

      if (!faceEnrolled) {
        throw new Error(
          'This HIGH security account does not have enrolled ArcFace vectors in the database yet.',
        );
      }

      let faceSamples: unknown;
      if (faceSamplesJson.trim()) {
        try {
          faceSamples = JSON.parse(faceSamplesJson);
        } catch {
          throw new Error('ArcFace verification payload is invalid JSON.');
        }
      }

      const faceCaptures = toFaceCaptures(capturedPhotos);
      if (!faceSamples && faceCaptures.length < 3) {
        throw new Error('Capture at least three guided face photos before verifying.');
      }

      const result = await verifyLoginFace(faceToken, {
        ...(faceSamples ? { faceSamples } : {}),
        ...(faceCaptures.length ? { faceCaptures } : {}),
      });
      applyFaceMatchDetails(result, 'success');
      setFaceVerificationPassed(true);
      setMessage('Face verification passed. Review the score below, then continue.');
    } catch (err: any) {
      if (err?.type === 'LOCKOUT') {
        applyLockout(err as LockoutError);
      } else {
        const apiError = err as ApiError;
        const details = extractFaceMatchDetails(apiError.data);

        if (details) {
          applyFaceMatchDetails(details, 'failed');
        }
        setFaceVerificationPassed(false);

        setError(
          typeof err?.message === 'string'
            ? err.message
            : 'Face verification failed',
        );
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleRefreshCaptcha() {
    if (!captchaId || loading || isLocked) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await refreshLoginCaptcha(captchaId);
      setCaptchaId(res.captchaId);
      setCaptchaImageDataUrl(res.captchaImageDataUrl);
      setCaptchaCode('');
      setMessage('Captcha updated. Enter the new symbol to continue.');
    } catch (err: any) {
      setError(err.message || 'Unable to refresh captcha');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h2 className={styles.title}>Login</h2>

        {message && <div className={styles.success}>{message}</div>}

        {stage === 'credentials' ? (
          <form onSubmit={handleLogin}>
            <div className={styles.field}>
              <label className={styles.label}>Email</label>
              <input
                className={styles.input}
                type="email"
                value={email}
                required
                disabled={loading || isLocked}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Password</label>
              <input
                className={styles.input}
                type="password"
                value={password}
                required
                disabled={loading || isLocked}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              className={styles.button}
              type="submit"
              disabled={loading || isLocked}
            >
              {loading
                ? 'Logging in...'
                : isLocked
                  ? `Try again in ${formatSeconds(lockoutSeconds ?? 0)}`
                  : 'Login'}
            </button>
          </form>
        ) : stage === 'verify_email_otp' ? (
          <form onSubmit={handleVerifyOtpEmail}>
            {deliveryEmail && (
              <div className={styles.success}>
                Verification code sent to {deliveryEmail}
              </div>
            )}

            <div className={styles.field}>
              <label className={styles.label}>Email OTP code</label>
              <input
                className={styles.input}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otpCode}
                required
                disabled={loading || isLocked}
                onChange={(e) =>
                  setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                }
              />
            </div>

            <button
              className={styles.button}
              type="submit"
              disabled={loading || isLocked || otpCode.length !== 6}
            >
              {loading
                ? 'Verifying...'
                : isLocked
                  ? `Try again in ${formatSeconds(lockoutSeconds ?? 0)}`
                  : 'Verify and continue'}
            </button>

            <button
              className={styles.secondaryButton}
              type="button"
              disabled={loading}
              onClick={() => {
                setStage('credentials');
                setMfaToken(null);
                setOtpCode('');
                setDeliveryEmail(null);
                setError(null);
                setMessage(null);
              }}
            >
              Back to password login
            </button>
          </form>
        ) : stage === 'verify_captcha' ? (
          <form onSubmit={handleVerifyCaptcha}>
            {captchaImageDataUrl && (
              <div className={styles.captchaWrap}>
                <img
                  src={captchaImageDataUrl}
                  alt="Captcha image"
                  className={styles.captchaImage}
                />
                <button
                  className={styles.captchaRefreshButton}
                  type="button"
                  disabled={loading || isLocked}
                  onClick={handleRefreshCaptcha}
                >
                  Change symbol
                </button>
              </div>
            )}

            <div className={styles.field}>
              <label className={styles.label}>Captcha code</label>
              <input
                className={styles.input}
                type="text"
                autoComplete="off"
                maxLength={6}
                value={captchaCode}
                required
                disabled={loading || isLocked}
                onChange={(e) => setCaptchaCode(e.target.value.toUpperCase())}
              />
            </div>

            <button
              className={styles.button}
              type="submit"
              disabled={loading || isLocked || captchaCode.trim().length < 4}
            >
              {loading
                ? 'Verifying...'
                : isLocked
                  ? `Try again in ${formatSeconds(lockoutSeconds ?? 0)}`
                  : 'Continue to face check'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyFace}>
            <div className={styles.facePanel}>
              <div className={styles.facePanelTitle}>Face verification</div>
              <div className={styles.hint}>
                {facePromptMessage ??
                  'Take new face photos and compare them with enrolled vectors.'}
              </div>
              {faceThreshold !== null && (
                <div className={styles.hint}>
                  Matching threshold: {faceThreshold}
                </div>
              )}
            </div>

            {faceMatchDetails && (
              <div
                className={
                  faceMatchDetails.status === 'success'
                    ? styles.scorePanelSuccess
                    : styles.scorePanelFailure
                }
              >
                <div className={styles.scorePanelTitle}>Face matching result</div>
                {typeof faceMatchDetails.averageScore === 'number' && (
                  <div className={styles.scoreLine}>
                    Average score: {faceMatchDetails.averageScore.toFixed(4)}
                  </div>
                )}
                {typeof faceMatchDetails.threshold === 'number' && (
                  <div className={styles.scoreLine}>
                    Threshold: {faceMatchDetails.threshold.toFixed(4)}
                  </div>
                )}
                {faceMatchDetails.matchedAngles?.length ? (
                  <div className={styles.scoreLine}>
                    Matched angles: {faceMatchDetails.matchedAngles.join(', ')}
                  </div>
                ) : null}
                {faceMatchDetails.scoresByAngle &&
                  Object.keys(faceMatchDetails.scoresByAngle).length > 0 && (
                    <div className={styles.scoreList}>
                      {Object.entries(faceMatchDetails.scoresByAngle).map(
                        ([angle, score]) => (
                          <div key={angle} className={styles.scoreLine}>
                            {angle}: {score.toFixed(4)}
                          </div>
                        ),
                      )}
                    </div>
                  )}
              </div>
            )}

            <div className={styles.captureChecklist}>
              {FACE_CAPTURE_ANGLES.map((angle) => {
                const done = capturedPhotos.some((photo) => photo.angle === angle);
                return (
                  <div
                    key={angle}
                    className={
                      done
                        ? styles.captureChecklistDone
                        : styles.captureChecklistPending
                    }
                  >
                    {done ? 'Captured' : 'Pending'}: {angle}
                  </div>
                );
              })}
            </div>

            <details className={styles.advancedBox}>
              <summary className={styles.advancedSummary}>
                ArcFace verification payload
              </summary>
              <div className={styles.hint}>
                Camera captures are sent to the backend ArcFace service
                automatically. This field remains available as a manual override.
              </div>
              <textarea
                className={styles.input}
                rows={8}
                value={faceSamplesJson}
                disabled={loading || isLocked || !faceEnrolled}
                onChange={(e) => setFaceSamplesJson(e.target.value)}
                placeholder={`[
  {
    "angle": "STRAIGHT",
    "capturedAt": "2026-04-04T10:05:00.000Z",
    "vector": [0.12, -0.33, 0.44]
  },
  {
    "angle": "LEFT",
    "capturedAt": "2026-04-04T10:05:05.000Z",
    "vector": [0.11, -0.31, 0.41]
  },
  {
    "angle": "RIGHT",
    "capturedAt": "2026-04-04T10:05:10.000Z",
    "vector": [0.1, -0.29, 0.4]
  }
]`}
              />
            </details>

            <button
              className={styles.button}
              type="button"
              disabled={!faceEnrolled}
              onClick={() => setCameraOpen(true)}
            >
              Open camera
            </button>

            <button
              className={styles.button}
              type="submit"
              disabled={
                loading ||
                isLocked ||
                faceVerificationPassed ||
                !faceEnrolled ||
                (!faceSamplesJson.trim() && capturedPhotos.length < 3)
              }
            >
              {loading
                ? 'Matching face vectors...'
                : isLocked
                  ? `Try again in ${formatSeconds(lockoutSeconds ?? 0)}`
                  : 'Verify face and login'}
            </button>

            {faceVerificationPassed && (
              <button
                className={styles.button}
                type="button"
                onClick={() => router.push('/dashboard')}
              >
                Continue to dashboard
              </button>
            )}
          </form>
        )}

        {isLocked && lockoutBaseMessage ? (
          <div className={styles.error}>
            {lockoutBaseMessage} Try again in{' '}
            {formatSeconds(lockoutSeconds ?? 0)}.
          </div>
        ) : error ? (
          <div className={styles.error}>{error}</div>
        ) : null}

        <div className={styles.switch}>
          Don&apos;t have an account?{' '}
          <a href="/register" className={styles.link}>
            Register
          </a>
        </div>
      </div>

      {cameraOpen && (
        <div className={styles.cameraOverlay}>
          <div className={styles.cameraCard}>
            <h3 className={styles.cameraTitle}>Face verification capture</h3>
            <p className={styles.cameraGuide}>
              {nextRequiredAngle
                ? ANGLE_INSTRUCTIONS[nextRequiredAngle]
                : 'All guided photos are captured. You can close the camera or recapture.'}
            </p>

            <div className={styles.cameraPreview}>
              <video
                ref={videoRef}
                className={styles.video}
                autoPlay
                muted
                playsInline
              />
              {!cameraReady && !cameraError && (
                <div className={styles.cameraLoading}>Starting camera...</div>
              )}
            </div>

            <div className={styles.captureChecklist}>
              {FACE_CAPTURE_ANGLES.map((angle) => {
                const done = capturedPhotos.some((photo) => photo.angle === angle);
                return (
                  <div
                    key={angle}
                    className={
                      done
                        ? styles.captureChecklistDone
                        : styles.captureChecklistPending
                    }
                  >
                    {done ? 'Captured' : 'Pending'}: {angle}
                  </div>
                );
              })}
            </div>

            {cameraError && <div className={styles.error}>{cameraError}</div>}

            <div className={styles.cameraActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  stopCamera();
                  setCameraOpen(false);
                }}
              >
                Close
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  setCapturedPhotos([]);
                  setCameraError(null);
                }}
              >
                Retake all
              </button>
              <button
                type="button"
                className={styles.button}
                onClick={capturePhoto}
                disabled={!cameraReady || !nextRequiredAngle}
              >
                {nextRequiredAngle ? `Capture ${nextRequiredAngle}` : 'Captured'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
