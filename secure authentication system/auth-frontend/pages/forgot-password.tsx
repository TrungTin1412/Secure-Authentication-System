import { useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import styles from './login.module.css';
import { type LockoutError } from '../lib/api';
import {
  requestPasswordReset,
  resetPasswordWithRecovery,
} from '../lib/auth';

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

function formatSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [recoveryPhrase, setRecoveryPhrase] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState<number | null>(null);
  const [invalidAttempts, setInvalidAttempts] = useState(0);

  const passwordCheck = useMemo(() => evaluatePassword(newPassword), [newPassword]);

  function handleFailedRecoveryAttempt(nextCount: number, nextError: string) {
    if (nextCount >= 3) {
      router.push('/');
      return;
    }

    setInvalidAttempts(nextCount);
    setError(`${nextError} You have ${3 - nextCount} attempt(s) left before returning home.`);
  }

  async function handleStartRecovery(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    setLockoutSeconds(null);

    try {
      const res = await requestPasswordReset(email);
      setRecoveryReady(true);
      setMessage(res.message);
    } catch (err: any) {
      if (err?.type === 'LOCKOUT') {
        const lockout = err as LockoutError;
        setLockoutSeconds(Math.max(1, Math.ceil(lockout.retryAfterSeconds || 0)));
        setError(lockout.message);
      } else {
        setError(err.message || 'Unable to start password recovery');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    setLockoutSeconds(null);

    if (newPassword !== confirmPassword) {
      setLoading(false);
      setError('Passwords do not match');
      return;
    }

    if (passwordCheck.strength !== 'STRONG') {
      setLoading(false);
      setError('Password does not meet security requirements');
      return;
    }

    if (recoveryPhrase.trim().length < 12) {
      setLoading(false);
      setError('Recovery phrase must be at least 12 characters long');
      return;
    }

    try {
      const res = await resetPasswordWithRecovery(
        email,
        recoveryPhrase,
        newPassword,
      );
      setInvalidAttempts(0);
      router.push(`/login?reset=1&message=${encodeURIComponent(res.message)}`);
    } catch (err: any) {
      if (
        err?.message === 'Invalid recovery credentials' ||
        err?.type === 'LOCKOUT'
      ) {
        const nextCount = invalidAttempts + 1;
        if (err?.type === 'LOCKOUT') {
          const lockout = err as LockoutError;
          setLockoutSeconds(
            Math.max(1, Math.ceil(lockout.retryAfterSeconds || 0)),
          );
          handleFailedRecoveryAttempt(nextCount, lockout.message);
        } else {
          handleFailedRecoveryAttempt(nextCount, err.message);
        }
      } else {
        setError(err.message || 'Password reset failed');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h2 className={styles.title}>Forgot Password</h2>

        {!recoveryReady ? (
          <form onSubmit={handleStartRecovery}>
            <div className={styles.field}>
              <label className={styles.label}>Email</label>
              <input
                className={styles.input}
                type="email"
                value={email}
                required
                disabled={loading}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <button className={styles.button} type="submit" disabled={loading}>
              {loading ? 'Checking account...' : 'Continue'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetPassword}>
            <div className={styles.success}>
              Recovery ready for {email}
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Recovery Phrase</label>
              <textarea
                className={styles.input}
                rows={3}
                value={recoveryPhrase}
                required
                disabled={loading}
                onChange={(e) => setRecoveryPhrase(e.target.value)}
                placeholder="Enter the private phrase you created during registration."
              />
              <div className={styles.hint}>
                Use the same phrase you created at registration. It should be a
                private phrase, not a real-life fact.
              </div>
              <div className={styles.facePanel}>
                <div className={styles.facePanelTitle}>Recovery phrase reminders</div>
                <div className={styles.scoreLine}>
                  Use the exact phrase you created.
                </div>
                <div className={styles.scoreLine}>
                  Avoid entering names, birthdays, or other public facts.
                </div>
                <div className={styles.scoreLine}>
                  Three wrong attempts will return you to the home page.
                </div>
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>New Password</label>
              <input
                className={styles.input}
                type="password"
                value={newPassword}
                required
                disabled={loading}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>

            {newPassword && (
              <div className={styles.hint}>
                Password strength: {passwordCheck.strength}. Use 8+ characters,
                an uppercase letter, and a special character.
              </div>
            )}

            <div className={styles.field}>
              <label className={styles.label}>Confirm New Password</label>
              <input
                className={styles.input}
                type="password"
                value={confirmPassword}
                required
                disabled={loading}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            <button className={styles.button} type="submit" disabled={loading}>
              {loading ? 'Resetting password...' : 'Reset password'}
            </button>

            <button
              className={styles.secondaryButton}
              type="button"
              disabled={loading}
              onClick={() => {
                setRecoveryReady(false);
                setRecoveryPhrase('');
                setNewPassword('');
                setConfirmPassword('');
                setError(null);
                setMessage(null);
                setLockoutSeconds(null);
              }}
            >
              Change email
            </button>
          </form>
        )}

        {message ? <div className={styles.success}>{message}</div> : null}
        {lockoutSeconds ? (
          <div className={styles.error}>
            Too many failed recovery attempts. Try again in{' '}
            {formatSeconds(lockoutSeconds)}.
          </div>
        ) : null}
        {error ? <div className={styles.error}>{error}</div> : null}

        <div className={styles.switch}>
          Remembered it?{' '}
          <a href="/login" className={styles.link}>
            Back to login
          </a>
        </div>
      </div>
    </div>
  );
}
