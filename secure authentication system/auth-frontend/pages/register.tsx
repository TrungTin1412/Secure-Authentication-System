import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import styles from './register.module.css';
import { apiRequest } from '../lib/api';

type SecurityLevel = 'BASIC' | 'BALANCED' | 'HIGH';
type CaptureAngle = 'STRAIGHT' | 'LEFT' | 'RIGHT' | 'UP' | 'DOWN';
type CapturedPhoto = {
  angle: CaptureAngle;
  dataUrl: string;
  capturedAt: string;
};

const HIGH_SECURITY_ANGLES: CaptureAngle[] = [
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

function evaluatePassword(password: string) {
  const rules = {
    minLength: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    specialChar: /[^A-Za-z0-9]/.test(password),
  };

  const passed = Object.values(rules).filter(Boolean).length;

  let strength: 'WEAK' | 'MEDIUM' | 'STRONG' = 'WEAK';
  if (passed === 2) strength = 'MEDIUM';
  if (passed === 3) strength = 'STRONG';

  return { rules, strength };
}

function toFaceCaptures(photos: CapturedPhoto[]) {
  return photos.map((photo) => ({
    angle: photo.angle,
    imageDataUrl: photo.dataUrl,
    capturedAt: photo.capturedAt,
  }));
}

export default function RegisterPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryPhrase, setRecoveryPhrase] = useState('');
  const [securityLevel, setSecurityLevel] =
    useState<SecurityLevel>('BALANCED');
  const [capturedPhotos, setCapturedPhotos] = useState<CapturedPhoto[]>([]);
  const [faceSamplesJson, setFaceSamplesJson] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const passwordCheck = evaluatePassword(password);

  const nextRequiredAngle = useMemo(
    () =>
      HIGH_SECURITY_ANGLES.find(
        (angle) => !capturedPhotos.some((photo) => photo.angle === angle),
      ) ?? null,
    [capturedPhotos],
  );

  const hasCompletedHighSecurityCapture = HIGH_SECURITY_ANGLES.every((angle) =>
    capturedPhotos.some((photo) => photo.angle === angle),
  );

  useEffect(() => {
    if (securityLevel !== 'HIGH') {
      setCapturedPhotos([]);
      setFaceSamplesJson('');
      setCameraError(null);
      stopCamera();
      setCameraOpen(false);
    }
  }, [securityLevel]);

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
          'Camera access was blocked. Please allow permission and try again.',
        );
      }
    };

    void startCamera();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [cameraOpen]);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraReady(false);
  }

  function openCamera() {
    setCameraError(null);
    setCameraOpen(true);
  }

  function closeCamera() {
    stopCamera();
    setCameraOpen(false);
  }

  function capturePhoto() {
    if (!nextRequiredAngle) {
      return;
    }

    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setCameraError('The camera feed is not ready yet.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext('2d');
    if (!context) {
      setCameraError('Unable to capture the current frame.');
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

  function resetCapture() {
    setCapturedPhotos([]);
    setFaceSamplesJson('');
    setCameraError(null);
  }

  function finishCapture() {
    if (!hasCompletedHighSecurityCapture) {
      setCameraError('Please capture every required angle before finishing.');
      return;
    }

    closeCamera();
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (passwordCheck.strength !== 'STRONG') {
      setError('Password does not meet security requirements');
      return;
    }

    if (recoveryPhrase.trim().length < 12) {
      setError('Recovery phrase must be at least 12 characters long');
      return;
    }

    if (securityLevel === 'HIGH' && !hasCompletedHighSecurityCapture) {
      openCamera();
      return;
    }

    setLoading(true);

    try {
      let faceSamples: unknown;
      const faceCaptures =
        securityLevel === 'HIGH' ? toFaceCaptures(capturedPhotos) : undefined;
      if (securityLevel === 'HIGH' && faceSamplesJson.trim()) {
        try {
          faceSamples = JSON.parse(faceSamplesJson);
        } catch {
          setError('ArcFace vector payload is invalid JSON');
          setLoading(false);
          return;
        }
      }

      await apiRequest('/auth/register', 'POST', {
        email,
        password,
        recoveryPhrase,
        securityLevel,
        ...(faceSamples ? { faceSamples } : {}),
        ...(faceCaptures?.length ? { faceCaptures } : {}),
      });

      router.push('/login?registered=1');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h2 className={styles.title}>Register</h2>

        <form onSubmit={handleRegister}>
          <div className={styles.field}>
            <label className={styles.label}>Email</label>
            <input
              className={styles.input}
              type="email"
              value={email}
              required
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
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {password && (
            <div className={styles.passwordStrength}>
              <div
                className={`${styles.strengthBar} ${
                  styles[passwordCheck.strength]
                }`}
              />
              <p className={styles.strengthLabel}>
                Password strength: {passwordCheck.strength}
              </p>

              <ul className={styles.ruleList}>
                <li
                  className={
                    passwordCheck.rules.minLength ? styles.pass : styles.fail
                  }
                >
                  At least 8 characters
                </li>
                <li
                  className={
                    passwordCheck.rules.uppercase ? styles.pass : styles.fail
                  }
                >
                  Contains uppercase letter
                </li>
                <li
                  className={
                    passwordCheck.rules.specialChar ? styles.pass : styles.fail
                  }
                >
                  Contains special character
                </li>
              </ul>
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.label}>Confirm Password</label>
            <input
              className={styles.input}
              type="password"
              value={confirmPassword}
              required
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Recovery Phrase</label>
            <textarea
              className={`${styles.input} ${styles.textarea}`}
              rows={3}
              value={recoveryPhrase}
              required
              onChange={(e) => setRecoveryPhrase(e.target.value)}
              placeholder="Example: river lantern coffee april"
            />
            <div className={styles.securityHint}>
              Create a private phrase you can remember but others cannot guess.
              You will need it if you forget your password.
            </div>
            <div className={styles.guidelineBox}>
              <div className={styles.guidelineTitle}>Recovery phrase guidelines</div>
              <ul className={styles.guidelineList}>
                <li>Use 3 to 5 unrelated words or a short private sentence.</li>
                <li>Make it at least 12 characters long.</li>
                <li>Do not use birthdays, names, schools, addresses, or phone numbers.</li>
                <li>Do not reuse your password.</li>
              </ul>
            </div>
          </div>

          {confirmPassword && password !== confirmPassword && (
            <div className={styles.error}>Passwords do not match</div>
          )}

          <div className={styles.securityBox}>
            <div className={styles.securityOption}>
              <input
                type="radio"
                checked={securityLevel === 'BASIC'}
                onChange={() => setSecurityLevel('BASIC')}
              />
              <span>Basic</span>
            </div>
            <div className={styles.securityHint}>
              Fast login, minimal security checks
            </div>

            <div className={styles.securityOption}>
              <input
                type="radio"
                checked={securityLevel === 'BALANCED'}
                onChange={() => setSecurityLevel('BALANCED')}
              />
              <span>Balanced (Recommended)</span>
            </div>
            <div className={styles.securityHint}>
              Best balance between security and usability
            </div>

            <div className={styles.securityOption}>
              <input
                type="radio"
                checked={securityLevel === 'HIGH'}
                onChange={() => setSecurityLevel('HIGH')}
              />
              <span>High Security</span>
            </div>
            <div className={styles.securityHint}>
              Strongest protection with password, OTP, captcha, and face
              verification
            </div>
          </div>

          {securityLevel === 'HIGH' && (
            <div className={styles.captureSummary}>
              <div className={styles.captureSummaryHeader}>
                <span>Face capture status</span>
                <button
                  type="button"
                  className={styles.captureAction}
                  onClick={openCamera}
                >
                  {hasCompletedHighSecurityCapture ? 'Retake capture' : 'Open camera'}
                </button>
              </div>

              <div className={styles.securityHint}>
                Clicking the register button will open the camera and guide the
                user through straight, left, right, up, and down face capture.
              </div>

              <div className={styles.captureChecklist}>
                {HIGH_SECURITY_ANGLES.map((angle) => {
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

              {capturedPhotos.length > 0 && (
                <div className={styles.thumbnailGrid}>
                  {capturedPhotos.map((photo) => (
                    <img
                      key={photo.angle}
                      src={photo.dataUrl}
                      alt={`${photo.angle} face capture`}
                      className={styles.thumbnail}
                    />
                  ))}
                </div>
              )}

              <details className={styles.advancedBox}>
                <summary className={styles.advancedSummary}>
                  ArcFace vector payload
                </summary>
                <div className={styles.securityHint}>
                  Camera captures are now sent to the backend ArcFace service
                  automatically. This field remains as an advanced override for testing.
                </div>
                <textarea
                  className={styles.input}
                  rows={8}
                  value={faceSamplesJson}
                  onChange={(e) => setFaceSamplesJson(e.target.value)}
                  placeholder={`[
  {
    "angle": "STRAIGHT",
    "capturedAt": "2026-04-04T10:00:00.000Z",
    "vector": [0.12, -0.33, 0.44]
  },
  {
    "angle": "LEFT",
    "capturedAt": "2026-04-04T10:00:05.000Z",
    "vector": [0.11, -0.31, 0.41]
  },
  {
    "angle": "RIGHT",
    "capturedAt": "2026-04-04T10:00:10.000Z",
    "vector": [0.10, -0.29, 0.40]
  }
]`}
                />
              </details>
            </div>
          )}

          <button className={styles.button} type="submit" disabled={loading}>
            {loading
              ? 'Registering...'
              : securityLevel === 'HIGH' && !hasCompletedHighSecurityCapture
                ? 'Continue to face capture'
                : 'Create account'}
          </button>
        </form>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.switch}>
          Already have an account?{' '}
          <a href="/login" className={styles.link}>
            Login
          </a>
        </div>
      </div>

      {cameraOpen && (
        <div className={styles.cameraOverlay}>
          <div className={styles.cameraCard}>
            <h3 className={styles.cameraTitle}>High security face capture</h3>
            <p className={styles.cameraGuide}>
              {nextRequiredAngle
                ? ANGLE_INSTRUCTIONS[nextRequiredAngle]
                : 'All required angles are captured. Finish this step to continue.'}
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
              {HIGH_SECURITY_ANGLES.map((angle) => {
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
                onClick={closeCamera}
              >
                Close
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={resetCapture}
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
              <button
                type="button"
                className={styles.button}
                onClick={finishCapture}
                disabled={!hasCompletedHighSecurityCapture}
              >
                Finish capture
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
