export interface Env {
  DATABASE_URL: string;
  AUTH_USERNAME: string;
  AUTH_PASSWORD_HASH: string;
  JWT_SECRET: string;
  COOKIE_SECURE: boolean;
  PORT: number;
  /** Reverse-proxy hops to trust for the client IP (Express `trust proxy`). */
  TRUST_PROXY: number;
}

/** Fails fast at boot when configuration is missing or unsafe. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const errors: string[] = [];
  const str = (key: string): string => {
    const value = raw[key];
    if (typeof value !== 'string' || value.trim() === '') {
      errors.push(`${key} is required`);
      return '';
    }
    return value;
  };

  const int = (key: string, fallback: number, min: number, max: number): number => {
    const value = raw[key] === undefined || raw[key] === '' ? fallback : Number(raw[key]);
    if (!Number.isInteger(value) || value < min || value > max) {
      errors.push(`${key} must be an integer between ${min} and ${max}`);
    }
    return value;
  };

  const env: Env = {
    DATABASE_URL: str('DATABASE_URL'),
    AUTH_USERNAME: str('AUTH_USERNAME'),
    AUTH_PASSWORD_HASH: str('AUTH_PASSWORD_HASH'),
    JWT_SECRET: str('JWT_SECRET'),
    COOKIE_SECURE: raw.COOKIE_SECURE !== 'false',
    PORT: int('PORT', 3000, 1, 65535),
    TRUST_PROXY: int('TRUST_PROXY', 0, 0, 10),
  };

  if (env.AUTH_PASSWORD_HASH && !env.AUTH_PASSWORD_HASH.startsWith('$argon2')) {
    errors.push('AUTH_PASSWORD_HASH must be an argon2 hash (pnpm hash-password)');
  }
  if (env.JWT_SECRET && env.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters');
  }
  if (errors.length) {
    throw new Error(`Invalid environment:\n- ${errors.join('\n- ')}`);
  }
  return env;
}
