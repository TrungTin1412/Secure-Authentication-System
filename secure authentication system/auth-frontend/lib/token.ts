export function saveTokens(
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
) {
  if (typeof expiresIn !== 'number' || Number.isNaN(expiresIn)) {
    console.error('Invalid expiresIn:', expiresIn);
    return;
  }

  const expiresAt = Date.now() + expiresIn * 1000;

  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
  localStorage.setItem('expiresAt', String(expiresAt));
}


export function getAccessToken() {
  return localStorage.getItem('accessToken');
}

export function getRefreshToken() {
  return localStorage.getItem('refreshToken');
}

export function clearTokens() {
  localStorage.clear();
}
