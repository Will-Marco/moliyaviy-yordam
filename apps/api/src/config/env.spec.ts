import { validateEnv } from './env.js';

const valid = {
  DATABASE_URL: 'postgresql://localhost/db',
  AUTH_USERNAME: 'admin',
  AUTH_PASSWORD_HASH: '$argon2id$v=19$m=19456,t=2,p=1$abc$def',
  JWT_SECRET: 'x'.repeat(32),
};

describe('validateEnv', () => {
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
    expect(() => validateEnv({ ...valid, TRUST_PROXY: 'yes' })).toThrow(/TRUST_PROXY/);
    expect(validateEnv({ ...valid, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(1);
    expect(validateEnv(valid).TRUST_PROXY).toBe(0);
  });

  it('rejects a plaintext password and a short JWT secret', () => {
    expect(() => validateEnv({ ...valid, AUTH_PASSWORD_HASH: 'secret' })).toThrow(/argon2/);
    expect(() => validateEnv({ ...valid, JWT_SECRET: 'short' })).toThrow(/32/);
  });
});
