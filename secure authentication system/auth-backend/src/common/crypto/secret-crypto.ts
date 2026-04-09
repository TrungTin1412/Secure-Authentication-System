import * as crypto from 'crypto';

const ENCRYPTION_KEY_SOURCE =
  process.env.MFA_ENCRYPTION_KEY ||
  process.env.JWT_SECRET ||
  'change-this-mfa-encryption-key';

const ENCRYPTION_KEY = crypto
  .createHash('sha256')
  .update(ENCRYPTION_KEY_SOURCE)
  .digest();

export class SecretCrypto {
  static encrypt(plainText: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);

    const encrypted = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return `${iv.toString('base64')}.${authTag.toString('base64')}.${encrypted.toString('base64')}`;
  }

  static decrypt(payload: string): string {
    const [ivBase64, authTagBase64, encryptedBase64] = payload.split('.');

    if (!ivBase64 || !authTagBase64 || !encryptedBase64) {
      throw new Error('Invalid encrypted payload format');
    }

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      ENCRYPTION_KEY,
      Buffer.from(ivBase64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(authTagBase64, 'base64'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedBase64, 'base64')),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }
}
