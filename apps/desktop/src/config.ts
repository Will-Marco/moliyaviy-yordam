import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { hash } from '@node-rs/argon2'

/** Local onboarding store (M9b): the single shared login's hash + this install's JWT secret. */
export interface AppConfig {
  username: string
  passwordHash: string
  jwtSecret: string
}

export const configPath = (userData: string) => join(userData, 'config.json')

export function loadConfig(userData: string): AppConfig | null {
  try {
    return JSON.parse(readFileSync(configPath(userData), 'utf8')) as AppConfig
  } catch {
    return null
  }
}

/** True once the accountant has set a password on this computer. */
export function isConfigured(userData: string): boolean {
  const c = loadConfig(userData)
  return Boolean(c?.username && c?.passwordHash && c?.jwtSecret)
}

/** First run: hash the chosen password (argon2id) and mint a per-install JWT secret. */
export async function saveCredentials(userData: string, username: string, password: string): Promise<AppConfig> {
  const config: AppConfig = {
    username: username.trim(),
    passwordHash: await hash(password), // argon2id by default; verify reads params from the hash
    jwtSecret: randomBytes(48).toString('base64url'),
  }
  mkdirSync(dirname(configPath(userData)), { recursive: true })
  writeFileSync(configPath(userData), JSON.stringify(config, null, 2), { mode: 0o600 })
  return config
}
