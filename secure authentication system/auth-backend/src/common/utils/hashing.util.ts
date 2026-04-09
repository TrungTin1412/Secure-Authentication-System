import * as argon2 from 'argon2';
import * as bcrypt from 'bcrypt';

export enum HashAlgorithm {
  ARGON2ID = 'argon2id',
  BCRYPT = 'bcrypt',
}

export class HashingUtil {
  static async hash(password: string, algo: HashAlgorithm) {
    if (algo === HashAlgorithm.ARGON2ID) {
      return argon2.hash(password, { type: argon2.argon2id });
    }
    return bcrypt.hash(password, 12);
  }

  static async verify(hash: string, password: string, algo: HashAlgorithm) {
    if (algo === HashAlgorithm.ARGON2ID) {
      return argon2.verify(hash, password);
    }
    return bcrypt.compare(password, hash);
  }
}
