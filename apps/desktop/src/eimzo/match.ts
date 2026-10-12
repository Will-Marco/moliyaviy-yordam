import type { KeyInfo } from './alias.js'

export type KeyStatus = { status: 'ok' | 'expired'; key: KeyInfo } | { status: 'missing' }

/**
 * Firm STIR -> the E-IMZO key the app would log in with. `now` is Tashkent local time (`yyyy-mm-ddTHH:mm:ss`),
 * the same form as the certificate dates, so plain string comparison orders them.
 */
export function matchKeys(keys: KeyInfo[], tins: string[], now: string): Map<string, KeyStatus> {
  const result = new Map<string, KeyStatus>()
  for (const tin of tins) {
    const own = keys.filter((k) => k.tin === tin)
    const valid = own.filter((k) => isValid(k, now))
    // Several keys per firm (e.g. director + accountant): prefer a valid one, then the one that lasts longest.
    const pick = longest(valid.length ? valid : own)
    if (!pick) result.set(tin, { status: 'missing' })
    else result.set(tin, { status: valid.length ? 'ok' : 'expired', key: pick })
  }
  return result
}

const longest = (ks: KeyInfo[]) => ks.reduce<KeyInfo | undefined>((best, k) => (!best || (k.validTo ?? '') > (best.validTo ?? '') ? k : best), undefined)

const isValid = (k: KeyInfo, now: string) => !!k.validFrom && !!k.validTo && k.validFrom <= now && now < k.validTo
