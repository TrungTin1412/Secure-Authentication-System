import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import { logout } from '../lib/auth';

const PROTECTED_ROUTES = new Set(['/dashboard', '/admin']);
const TAB_AWAY_LOGOUT_MS = 15000;
const IDLE_LOGOUT_MS = 15000;

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const isProtectedRoute = PROTECTED_ROUTES.has(router.pathname);

  useEffect(() => {
    if (!isProtectedRoute || typeof window === 'undefined') {
      return;
    }

    const accessToken = localStorage.getItem('accessToken');
    const refreshToken = localStorage.getItem('refreshToken');

    if (!accessToken || !refreshToken) {
      void router.replace('/login');
    }
  }, [isProtectedRoute, router]);

  useEffect(() => {
    if (!isProtectedRoute || typeof document === 'undefined') {
      return;
    }

    let hiddenAt: number | null = null;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }

      if (hiddenAt && Date.now() - hiddenAt >= TAB_AWAY_LOGOUT_MS) {
        void logout();
      }

      hiddenAt = null;
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isProtectedRoute]);

  useEffect(() => {
    if (
      !isProtectedRoute ||
      typeof document === 'undefined' ||
      typeof window === 'undefined'
    ) {
      return;
    }

    let idleTimer: number | null = null;

    const clearIdleTimer = () => {
      if (idleTimer) {
        window.clearTimeout(idleTimer);
        idleTimer = null;
      }
    };

    const startIdleTimer = () => {
      clearIdleTimer();
      idleTimer = window.setTimeout(() => {
        if (document.visibilityState === 'visible') {
          void logout();
        }
      }, IDLE_LOGOUT_MS);
    };

    const handleActivity = () => {
      if (document.visibilityState === 'visible') {
        startIdleTimer();
      }
    };

    startIdleTimer();

    const activityEvents: Array<keyof DocumentEventMap> = [
      'mousemove',
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
    ];

    activityEvents.forEach((eventName) => {
      document.addEventListener(eventName, handleActivity, { passive: true });
    });

    document.addEventListener('visibilitychange', handleActivity);

    return () => {
      clearIdleTimer();
      activityEvents.forEach((eventName) => {
        document.removeEventListener(eventName, handleActivity);
      });
      document.removeEventListener('visibilitychange', handleActivity);
    };
  }, [isProtectedRoute]);

  return <Component {...pageProps} />;
}
