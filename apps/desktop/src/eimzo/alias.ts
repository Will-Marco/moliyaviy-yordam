/** What the app keeps from an E-IMZO key's certificate. Personal fields (owner name, JShShIR) are never returned. */
export interface KeyInfo {
  /** Firm STIR (OID 1.2.860.3.16.1.1); null for a personal key. */
  tin: string | null
  org: string | null
  title: string | null
  serial: string | null
  /** Local time as written in the certificate, `yyyy-mm-ddTHH:mm:ss`. */
  validFrom: string | null
  validTo: string | null
}

const TIN_OID = '1.2.860.3.16.1.1'

/** Parses the comma-separated `alias` of `pfx.list_all_certificates` (`key=value,...`, lower-case keys). */
export function parseAlias(alias: string): KeyInfo {
  const fields = new Map<string, string>()
  // A comma starts a new field only when a `key=` follows, so commas inside a firm name survive.
  for (const part of alias.split(/,(?=\s*[a-z0-9.]+=)/)) {
    const eq = part.indexOf('=')
    if (eq > 0) fields.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim())
  }
  return {
    tin: fields.get(TIN_OID) ?? null,
    org: fields.get('o') ?? null,
    title: fields.get('t') ?? null,
    serial: fields.get('serialnumber') ?? null,
    validFrom: certTime(fields.get('validfrom')),
    validTo: certTime(fields.get('validto')),
  }
}

// "2028.01.21 12:04:52" -> "2028-01-21T12:04:52"
function certTime(value: string | undefined): string | null {
  const m = value?.match(/^(\d{4})\.(\d{2})\.(\d{2}) (\d{2}:\d{2}:\d{2})$/)
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}` : null
}
