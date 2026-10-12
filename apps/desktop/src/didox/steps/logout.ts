import type { Page } from '../contract.js'
import * as L from '../locators.js'

const LOGOUT_WAIT_MS = 3_000

/**
 * Best-effort sign-out inside Didox. The real guarantee is the view clearing its session storage; any failure here is
 * swallowed so it never masks the firm's result.
 */
export async function logout(page: Page): Promise<void> {
  try {
    const present = await page.read<boolean>(L.exists(L.logoutEntry).js)
    if (!present) return
    await page.click(L.logoutEntry.js, { what: L.logoutEntry.what })
    await page.waitFor(L.leftDocuments.js, { timeoutMs: LOGOUT_WAIT_MS, what: L.leftDocuments.what })
  } catch {
    // the session is wiped by the view anyway
  }
}
