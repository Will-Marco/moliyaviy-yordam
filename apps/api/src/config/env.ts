export interface Env {
  /** 'pg' — server PostgreSQL via DATABASE_URL; 'pglite' — local file database (desktop, M9a). */
  DB_DRIVER: 'pg' | 'pglite';
  DATABASE_URL: string;
  /** PGlite data directory; empty → in-memory (tests). Used only when DB_DRIVER='pglite'. */
  PGLITE_DATA_DIR: string;
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

  const driverRaw = raw.DB_DRIVER === undefined || raw.DB_DRIVER === '' ? 'pg' : raw.DB_DRIVER;
  if (driverRaw !== 'pg' && driverRaw !== 'pglite') errors.push("DB_DRIVER must be 'pg' or 'pglite'");
  const driver = driverRaw as 'pg' | 'pglite';
  const dbUrl = driver === 'pg' ? str('DATABASE_URL') : typeof raw.DATABASE_URL === 'string' ? raw.DATABASE_URL : '';

  const env: Env = {
    DB_DRIVER: driver,
    DATABASE_URL: dbUrl,
    PGLITE_DATA_DIR: typeof raw.PGLITE_DATA_DIR === 'string' ? raw.PGLITE_DATA_DIR : '',
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
