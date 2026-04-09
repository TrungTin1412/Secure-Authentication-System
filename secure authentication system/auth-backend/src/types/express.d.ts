import { SecurityProfile } from 'src/security-profiles/security-profile.entity';

declare global {
  namespace Express {
    interface Request {
      user?: {
        sub: string;
        email: string;
        role: string;
        securityProfile?: SecurityProfile;
      };
    }
  }
}

export {};
