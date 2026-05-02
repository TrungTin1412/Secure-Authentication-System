import { useEffect, useState } from 'react';
import styles from './dashboard.module.css';
import { apiRequest } from '../lib/api';
import { refresh, logout } from '../lib/auth';

//TYPES //

type MeResponse = {
  userId: string;
  email: string;
  role: string;
  securityLevel: string;
};

type UserLogRow = {
  time: string;
  action: string;
  email: string;
  userId: string;
};

type AdminLogRow = {
  time: string;
  action: string;
  email: string;
  userId: string;
};

type LogRow = UserLogRow | AdminLogRow;

function isAdminLog(row: LogRow): row is AdminLogRow {
  return 'email' in row;
}

//HELPERS //

function formatCountdown(sec: number) {
  const s = Math.max(0, sec);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function getSecuritySummary(level: string) {
  switch (level) {
    case 'BASIC':
      return {
        hashing: 'bcrypt',
        accessTTL: 'Long',
        refreshTTL: 'Very long',
        behavior: 'Convenience-focused, fewer logouts',
      };
    case 'HIGH':
      return {
        hashing: 'Argon2id (high cost)',
        accessTTL: 'Very short',
        refreshTTL: 'Short',
        behavior: 'Maximum security',
      };
    default:
      return {
        hashing: 'Argon2id',
        accessTTL: 'Short',
        refreshTTL: 'Moderate',
        behavior: 'Balanced security and usability',
      };
  }
}

function handleRevoke(userId?: string) {
  if (!userId) {
    alert('Invalid userId – cannot revoke');
    return;
  }

  apiRequest(`/auth/admin/revoke-user/${userId}`, 'POST', undefined, true)
    .then(() => alert('User sessions revoked'))
    .catch((err) => alert('Failed to revoke: ' + err.message));
}

function formatActionLabel(action: string) {
  return action.replace(/_/g, ' ');
}

function getActionClass(action: string) {
  switch (action) {
    case 'REFRESH_REUSE':
      return styles.actionDanger;
    case 'LOGIN_FAILED':
      return styles.actionWarn;
    case 'ADMIN_REVOKE':
      return styles.actionWarn;
    case 'LOGIN_SUCCESS':
      return styles.actionSuccess;
    default:
      return styles.actionNeutral;
  }
}

//COMPONENT //

export default function DashboardPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);

  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // CHANGE PASSWORD //
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [cpError, setCpError] = useState<string | null>(null);
  const [cpSuccess, setCpSuccess] = useState<string | null>(null);
  const [cpLoading, setCpLoading] = useState(false);

  function handleApiError(_err: any) {
    logout();
  }

  function handleChangePassword() {
    setCpError(null);
    setCpSuccess(null);

    if (!currentPassword || !newPassword) {
      setCpError('Please fill all fields');
      return;
    }

    if (newPassword !== confirmPassword) {
      setCpError('Passwords do not match');
      return;
    }

    const doChange = () =>
      apiRequest(
        '/auth/change-password',
        'POST',
        { currentPassword, newPassword },
        true,
      )
        .then(() => {
          setCpSuccess('Password changed successfully');
          setShowChangePassword(false);
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
        })
        .catch(handleApiError)
        .finally(() => setCpLoading(false));

    setCpLoading(true);
    doChange();
  }

  // FETCH USER INFO //
  useEffect(() => {
    apiRequest('/users/me', 'GET', undefined, true)
      .then((data) => setMe(data))
      .catch(() => logout());
  }, []);

  // FETCH AUDIT LOG //
  useEffect(() => {
    if (!me) return;

    const endpoint = me.role === 'ADMIN'
      ? '/audit/admin'
      : '/audit/me';

    const fetchLogs = () =>
      apiRequest(endpoint, 'GET', undefined, true)
        .then((rows) => {
          setLogs(
            rows.map((r: any) => ({
              time: r.createdAt,
              action: r.action,
              email: r.email,
              userId: r.userId,
            })),
          );
        })
        .catch(handleApiError);

    fetchLogs();
  }, [me]);

  // TOKEN COUNTDOWN //
  useEffect(() => {
    const raw = localStorage.getItem('expiresAt');
    setExpiresAt(raw ? Number(raw) : null);
  }, []);

  useEffect(() => {
    if (!expiresAt) return;

    const tick = () => {
      const diff = Math.max(
        0,
        Math.floor((expiresAt - Date.now()) / 1000),
      );
      setSecondsLeft(diff);
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  // REFRESH ON EXPIRY //
  useEffect(() => {
    if (secondsLeft !== 1 || refreshing) return;

    setRefreshing(true);

    refresh()
      .then(() => {
        const raw = localStorage.getItem('expiresAt');
        setExpiresAt(raw ? Number(raw) : null);
      })
      .catch(() => logout())
      .finally(() => setRefreshing(false));
  }, [secondsLeft, refreshing]);

  const isAdmin = me?.role === 'ADMIN';
  const level = me?.securityLevel;
  const summary = level ? getSecuritySummary(level) : null;
  //RENDER //

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleWrap}>
          <h1>Dashboard</h1>
          <p className={styles.subtitle}>
            Authentication state, security level, token lifecycle, and audit events
          </p>
        </div>

        <div className={styles.actions}>
          <button
            className={`${styles.btn} ${styles.btnDanger}`}
            onClick={() => logout()}
          >
            Logout
          </button>
        </div>
      </div>

      <div className={styles.container}>
        <div className={styles.grid}>
          {/* USER INFO */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h3>User Information</h3>

              <span
                className={
                  me?.role === 'ADMIN'
                    ? styles.roleBadgeAdmin
                    : styles.roleBadgeUser
                }
              >
                {me?.role === 'ADMIN' ? 'ADMIN' : 'USER'}
              </span>
            </div>

            {me && (
              <div className={styles.kv}>
                <div className={styles.k}>Email</div>
                <div className={styles.v}>{me.email}</div>

                <div className={styles.k}>Security Level</div>

                <div className={styles.securityLevelBlock}>
                  <div className={styles.securityLevelValue}>
                    {me.securityLevel}
                  </div>

                  <button
                    type="button"
                    className={styles.changePasswordBtn}
                    onClick={() => setShowChangePassword(true)}
                  >
                    Change password
                  </button>
                </div>
              </div>
            )}

            {showChangePassword && (
              <div className={styles.changePasswordBox}>
                <input
                  type="password"
                  placeholder="Current password"
                  className={styles.input}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoFocus
                />

                <input
                  type="password"
                  placeholder="New password"
                  className={styles.input}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />

                <input
                  type="password"
                  placeholder="Confirm new password"
                  className={styles.input}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />

                {cpError && <div className={styles.error}>{cpError}</div>}
                {cpSuccess && <div className={styles.success}>{cpSuccess}</div>}

                <div className={styles.changePasswordActions}>
                  <button
                    className={styles.updateBtn}
                    onClick={handleChangePassword}
                    disabled={cpLoading}
                  >
                    {cpLoading ? 'Updating…' : 'Update'}
                  </button>

                  <button
                    className={styles.cancelBtn}
                    onClick={() => {
                      setShowChangePassword(false);
                      setCurrentPassword('');
                      setNewPassword('');
                      setConfirmPassword('');
                      setCpError(null);
                      setCpSuccess(null);
                      setCpLoading(false);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <div className={styles.split}>
              <div className={styles.metric}>
                <p className={styles.metricLabel}>Access token expires in</p>
                <p className={styles.metricValue}>
                  {formatCountdown(secondsLeft)}
                </p>
              </div>

              <div className={styles.metric}>
                <p className={styles.metricLabel}>Refresh status</p>
                <p className={styles.metricValue}>
                  {refreshing ? 'Refreshing…' : 'Idle'}
                </p>
              </div>
            </div>
          </div>

          {/* SECURITY SUMMARY */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>Security Summary</h3>
            </div>

            {summary ? (
              <div className={styles.kv}>
                <div className={styles.k}>Password hashing</div>
                <div className={styles.v}>{summary.hashing}</div>

                <div className={styles.k}>Access token TTL</div>
                <div className={styles.v}>{summary.accessTTL}</div>

                <div className={styles.k}>Refresh token TTL</div>
                <div className={styles.v}>{summary.refreshTTL}</div>

                <div className={styles.k}>Behavior</div>
                <div className={styles.v}>{summary.behavior}</div>
              </div>
            ) : (
              <div className={styles.small}>Loading security profile…</div>
            )}
          </div>

        </div>

        {/* ACTIVITY LOG */}
        <div className={styles.card} style={{ marginTop: 16 }}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>Activity Log</h3>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Time</th>
                  {isAdmin && <th>User</th>}
                  <th className={styles.actionCol}>Action</th>
                  {isAdmin && <th>Manage</th>}
                </tr>
              </thead>
              <tbody>
                {logs.map((row, idx) => (
                  <tr key={idx}>
                    <td>{new Date(row.time).toLocaleString()}</td>
                    {isAdmin && isAdminLog(row) && <td>{row.email}</td>}
                    <td
                      className={`${styles.actionCol} ${getActionClass(row.action)}`}
                    >
                      {formatActionLabel(row.action)}
                    </td>
                    {isAdmin && (
                      <td>
                        <button
                          className={styles.revokeBtn}
                          onClick={() => handleRevoke(row.userId)}
                        >
                          {row.action === 'REFRESH_REUSE' ? 'Revoke Now' : 'Revoke'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  );
}
