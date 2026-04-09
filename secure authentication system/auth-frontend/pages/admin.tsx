import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import styles from './admin.module.css';
import { apiRequest } from '@/lib/api';
import { logout } from '@/lib/auth';

type Profile = {
  userId: string;
  email: string;
  role: string;
};

export default function AdminPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 🔒 Frontend RBAC check
  useEffect(() => {
    apiRequest('/users/me', 'GET', undefined, true)
      .then((data) => {
        if (data.role !== 'ADMIN') {
          router.replace('/dashboard'); // ⛔ redirect USER
          return;
        }
        setProfile(data);
      })
      .catch(() => {
        logout();
      });
  }, []);

  async function handleRevoke(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      await apiRequest(
        `/auth/admin/revoke-user/${userId}`,
        'POST',
        undefined,
        true,
      );
      setMessage('User sessions revoked successfully');
      setUserId('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // While checking role
  if (!profile) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>Checking permissions…</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h2 className={styles.title}>Admin – Revoke Sessions</h2>

        <form onSubmit={handleRevoke}>
          <input
            className={styles.input}
            value={userId}
            required
            placeholder="Target user UUID"
            onChange={(e) => setUserId(e.target.value)}
          />

          <button
            className={styles.button}
            type="submit"
            disabled={loading}
          >
            {loading ? 'Revoking…' : 'Revoke Sessions'}
          </button>
        </form>

        {message && <div className={styles.success}>{message}</div>}
        {error && <div className={styles.error}>{error}</div>}
      </div>
    </div>
  );
}
        
