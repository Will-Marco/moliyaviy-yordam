import type { KeyInfo } from './alias.js'

/** `unknown`: the key exists but its validity dates could not be read, so the app cannot tell if it still works. */
export type KeyStatus = { status: 'ok' | 'expired' | 'unknown'; key: KeyInfo } | { status: 'missing' }

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
    const unreadable = own.filter((k) => !k.validFrom || !k.validTo)
    const pick = longest(valid.length ? valid : own)
    if (!pick) result.set(tin, { status: 'missing' })
    else if (valid.length) result.set(tin, { status: 'ok', key: pick })
    else if (unreadable.length) result.set(tin, { status: 'unknown', key: unreadable[0]! })
    else result.set(tin, { status: 'expired', key: pick })
  }
  return result
}

const longest = (ks: KeyInfo[]) => ks.reduce<KeyInfo | undefined>((best, k) => (!best || (k.validTo ?? '') > (best.validTo ?? '') ? k : best), undefined)

const isValid = (k: KeyInfo, now: string) => !!k.validFrom && !!k.validTo && k.validFrom <= now && now < k.validTo
