export interface Env {
  /** 'pg' — server PostgreSQL via DATABASE_URL; 'pglite' — local file database (desktop, M9a). */
  DB_DRIVER: 'pg' | 'pglite';
  DATABASE_URL: string;
  /** PGlite data directory; empty → in-memory (tests). Used only when DB_DRIVER='pglite'. */
  PGLITE_DATA_DIR: string;
  AUTH_USERNAME: string;
  AUTH_PASSWORD_HASH: string;
  JWT_SECRET: string;
  /**
   * Second key the AuthGuard accepts session cookies signed with (M13 §4.2): the desktop robot mints its own token
   * with it, so an unattended run does not depend on a person's session. Empty → only JWT_SECRET sessions.
   */
  ROBOT_SECRET: string;
  COOKIE_SECURE: boolean;
  PORT: number;
  /** Built web UI directory the API serves (desktop, M9b). Empty → web runs separately (dev/server). */
  WEB_ROOT: string;
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
    ROBOT_SECRET: typeof raw.ROBOT_SECRET === 'string' ? raw.ROBOT_SECRET : '',
    COOKIE_SECURE: raw.COOKIE_SECURE !== 'false',
    WEB_ROOT: typeof raw.WEB_ROOT === 'string' ? raw.WEB_ROOT : '',
    PORT: int('PORT', 3000, 0, 65535),
    TRUST_PROXY: int('TRUST_PROXY', 0, 0, 10),
  };

  if (env.AUTH_PASSWORD_HASH && !env.AUTH_PASSWORD_HASH.startsWith('$argon2')) {
    errors.push('AUTH_PASSWORD_HASH must be an argon2 hash (pnpm hash-password)');
  }
  if (env.JWT_SECRET && env.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters');
  }
  if (env.ROBOT_SECRET && env.ROBOT_SECRET.length < 32) {
    errors.push('ROBOT_SECRET must be at least 32 characters');
  }
  // One shared key would make every robot token a person's session and vice versa — the split would mean nothing.
  if (env.ROBOT_SECRET && env.ROBOT_SECRET === env.JWT_SECRET) {
    errors.push('ROBOT_SECRET must differ from JWT_SECRET');
  }
  if (errors.length) {
    throw new Error(`Invalid environment:\n- ${errors.join('\n- ')}`);
  }
  return env;
}
