import { apiRequest } from './api';
import { saveTokens, clearTokens } from './token';

type FinalAuthResult = {
  mfaRequired: false;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  averageScore?: number;
  matchedAngles?: string[];
  threshold?: number;
};

type MfaChallengeResult = {
  mfaRequired: true;
  mfaToken: string;
  mfaType: 'email';
  mfaTokenExpiresIn: number;
  delivery: 'email';
  email: string;
  expiresIn: number;
};

type CaptchaChallengeResult = {
  captchaRequired: true;
  captchaId: string;
  captchaImageDataUrl: string;
  captchaExpiresIn: number;
};

type FaceChallengeResult = {
  faceRequired: true;
  faceEnrolled: boolean;
  faceToken: string;
  faceTokenExpiresIn: number;
  requiredAngles: string[];
  acceptedAngles: string[];
  minimumSamples: number;
  recommendedSamples: number;
  threshold: number;
  message?: string;
};

export type LoginResult = FinalAuthResult | MfaChallengeResult;
export type LoginResultWithCaptcha =
  | FinalAuthResult
  | MfaChallengeResult
  | CaptchaChallengeResult
  | FaceChallengeResult;
export type TotpVerifyResult =
  | FinalAuthResult
  | CaptchaChallengeResult
  | FaceChallengeResult;
export type CaptchaVerifyResult = FinalAuthResult | FaceChallengeResult;

export async function login(email: string, password: string) {
  const res = (await apiRequest('/auth/login', 'POST', {
    email,
    password,
  })) as LoginResultWithCaptcha;

  if ('accessToken' in res) {
    saveTokens(res.accessToken, res.refreshToken, res.expiresIn);
  }

  return res;
}

export async function verifyLoginTotp(mfaToken: string, code: string) {
  const res = (await apiRequest('/auth/login/otp_email', 'POST', {
    mfaToken,
    code,
  })) as TotpVerifyResult;

  if ('captchaRequired' in res && res.captchaRequired) {
    return res;
  }

  if ('accessToken' in res) {
    saveTokens(res.accessToken, res.refreshToken, res.expiresIn);
  }
  return res;
}

export async function verifyLoginCaptcha(captchaId: string, code: string) {
  const res = (await apiRequest('/auth/login/captcha', 'POST', {
    captchaId,
    code,
  })) as CaptchaVerifyResult;

  if ('accessToken' in res) {
    saveTokens(res.accessToken, res.refreshToken, res.expiresIn);
  }
  return res;
}

export async function verifyLoginFace(
  faceToken: string,
  payload: { faceSamples?: unknown; faceCaptures?: unknown },
) {
  const res = (await apiRequest('/auth/login/face', 'POST', {
    faceToken,
    ...payload,
  })) as FinalAuthResult;

  saveTokens(res.accessToken, res.refreshToken, res.expiresIn);
  return res;
}

export async function refreshLoginCaptcha(captchaId: string) {
  return (await apiRequest('/auth/login/captcha/refresh', 'POST', {
    captchaId,
  })) as CaptchaChallengeResult;
}

export async function refresh() {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) throw new Error('No refresh token');

  const res = await apiRequest('/auth/refresh', 'POST', {
    refreshToken,
  });

  saveTokens(res.accessToken, res.refreshToken, res.expiresIn);
}

export async function logout() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  const accessToken = localStorage.getItem('accessToken');

  try {
    if (apiUrl && accessToken) {
      await fetch(`${apiUrl}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });
    }
  } catch {
    // Ignore logout API errors and proceed with local cleanup.
  } finally {
    clearTokens();
    window.location.href = '/login';
  }
}

