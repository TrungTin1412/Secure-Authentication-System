import { refresh, logout } from './auth';
import { getAccessToken } from './token';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export type LockoutError = {
  type: 'LOCKOUT';
  message: string;
  retryAfterSeconds: number;
  lockoutUntil?: string;
  statusCode: 429;
};

export type ApiError = Error & {
  statusCode?: number;
  data?: any;
};

export async function apiRequest(
  path: string,
  method: string,
  body?: any,
  requireAuth = false,
) {
  let token = requireAuth ? getAccessToken() : null;

  const doFetch = async () =>
    fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

  let res = await doFetch();

  if (res.status === 401 && requireAuth) {
    try {
      await refresh();
      token = getAccessToken();
      res = await doFetch();

      if (res.status === 401) {
        logout();
        throw new Error('Session expired');
      }
    } catch {
      logout();
      throw new Error('Session expired');
    }
  }

  if (!res.ok) {
    let data: any = null;
    try {
      data = await res.json();
    } catch {
      // ignore
    }

    if (res.status === 429) {
      const retryAfterSecondsRaw = data?.retryAfterSeconds;
      const retryAfterSeconds = Number(retryAfterSecondsRaw);
      const lockoutError: LockoutError = {
        type: 'LOCKOUT',
        message:
          data?.message ||
          'Too many failed login attempts. Please try again later.',
        retryAfterSeconds: Number.isFinite(retryAfterSeconds)
          ? retryAfterSeconds
          : 0,
        lockoutUntil: data?.lockoutUntil,
        statusCode: 429,
      };
      throw lockoutError;
    }

    const message =
      typeof data?.message === 'string'
        ? data.message
        : data?.message?.message || data?.error || 'Request failed';

    const error = new Error(message) as ApiError;
    error.statusCode = res.status;
    error.data = data;
    throw error;
  }

  return res.json();
}
