import { validateEnv } from './env.js';

const valid = {
  DATABASE_URL: 'postgresql://localhost/db',
  AUTH_USERNAME: 'admin',
  AUTH_PASSWORD_HASH: '$argon2id$v=19$m=19456,t=2,p=1$abc$def',
  JWT_SECRET: 'x'.repeat(32),
};

describe('validateEnv', () => {
  it('needs DATABASE_URL for the pg driver but not for pglite', () => {
    expect(validateEnv({ ...valid, DB_DRIVER: 'pglite', DATABASE_URL: undefined, PGLITE_DATA_DIR: '/data/db' }).DB_DRIVER).toBe('pglite');
    const { DATABASE_URL: _drop, ...noUrl } = valid;
    expect(() => validateEnv({ ...noUrl, DB_DRIVER: 'pg' })).toThrow(/DATABASE_URL/);
    expect(() => validateEnv({ ...valid, DB_DRIVER: 'mysql' })).toThrow(/DB_DRIVER/);
  });
  it('defaults the driver to pg', () => {
    expect(validateEnv(valid).DB_DRIVER).toBe('pg');
  });

  it('accepts a complete configuration with secure cookies by default', () => {
    const env = validateEnv(valid);
    expect(env.COOKIE_SECURE).toBe(true);
    expect(env.PORT).toBe(3000);
  });

  it('only disables secure cookies when explicitly "false"', () => {
    expect(validateEnv({ ...valid, COOKIE_SECURE: 'false' }).COOKIE_SECURE).toBe(false);
    expect(validateEnv({ ...valid, COOKIE_SECURE: 'no' }).COOKIE_SECURE).toBe(true);
  });

  it('reports every missing variable', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL[\s\S]*AUTH_USERNAME[\s\S]*AUTH_PASSWORD_HASH[\s\S]*JWT_SECRET/);
  });

  it('validates PORT and TRUST_PROXY', () => {
    expect(() => validateEnv({ ...valid, PORT: '30OO' })).toThrow(/PORT/);
    expect(validateEnv({ ...valid, PORT: '0' }).PORT).toBe(0); // 0 = ephemeral (desktop)
    expect(() => validateEnv({ ...valid, TRUST_PROXY: 'yes' })).toThrow(/TRUST_PROXY/);
    expect(validateEnv({ ...valid, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(1);
    expect(validateEnv(valid).TRUST_PROXY).toBe(0);
  });

  it('rejects a plaintext password and a short JWT secret', () => {
    expect(() => validateEnv({ ...valid, AUTH_PASSWORD_HASH: 'secret' })).toThrow(/argon2/);
    expect(() => validateEnv({ ...valid, JWT_SECRET: 'short' })).toThrow(/32/);
  });

  describe('ROBOT_SECRET (M13 §4.2)', () => {
    it('is optional and empty when unset', () => {
      expect(validateEnv(valid).ROBOT_SECRET).toBe('');
      expect(validateEnv({ ...valid, ROBOT_SECRET: '' }).ROBOT_SECRET).toBe('');
    });

    it('accepts a long secret that differs from JWT_SECRET', () => {
      expect(validateEnv({ ...valid, ROBOT_SECRET: 'r'.repeat(32) }).ROBOT_SECRET).toBe('r'.repeat(32));
    });

    it('rejects a short secret and one equal to JWT_SECRET', () => {
      expect(() => validateEnv({ ...valid, ROBOT_SECRET: 'short' })).toThrow(/ROBOT_SECRET must be at least 32/);
      expect(() => validateEnv({ ...valid, ROBOT_SECRET: valid.JWT_SECRET })).toThrow(/ROBOT_SECRET must differ from JWT_SECRET/);
    });
  });
});
