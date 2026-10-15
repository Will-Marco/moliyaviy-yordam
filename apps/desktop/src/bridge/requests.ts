import type { CheckLoginResult, StartDraftsResult } from '../didox/run.js'
import { checkLoginPrompt, type Confirm, confirmed, draftsPrompt } from './confirm.js'

/*
 * What the page may *ask* the robot to do (CONSTITUTION §13, M13). Every request is validated, then confirmed in a
 * native dialog on this computer, and only then handed to the runner. The page gets the same answer shapes as before,
 * with CANCELLED when the person said no.
 */

export const TIN = /^\d{9}$/
export const MONTH = /^\d{4}-(?:0[1-9]|1[0-2])$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** A person picks firms from a list; a page that asks for hundreds is not that. */
const MAX_LENDERS = 200

const UNAVAILABLE = { ok: false, code: 'UNAVAILABLE', message: "Didox bilan ishlash bu versiyada yo'q" } as const

export interface DidoxRequestDeps {
  confirm: Confirm
  /** Absent in a build without the Didox side. */
  didox:
    | {
        checkLogin(tin: string): Promise<CheckLoginResult>
        createDrafts(opts: { month: string; lenderIds: string[] | 'all' }): Promise<StartDraftsResult>
      }
    | undefined
  /** Renews the robot's server key while a person is logged in, so the run that follows can read the invoices. */
  prepareRobot(): Promise<unknown>
  /** The organisation on the firm's E-IMZO key, or null — local and trusted, unlike anything the page sends. */
  firmName(tin: string): Promise<string | null>
  /** The picked lenders' names as the server lists them for the month, or null when that cannot be read. */
  lenderNames(month: string, ids: string[]): Promise<string[] | null>
}

export function createDidoxRequests(deps: DidoxRequestDeps) {
  return {
    async checkLogin(tin: unknown): Promise<CheckLoginResult> {
      if (typeof tin !== 'string' || !TIN.test(tin)) throw new Error('Invalid STIR')
      const didox = deps.didox
      if (!didox) return UNAVAILABLE
      const name = await deps.firmName(tin).catch(() => null)
      return confirmed(deps.confirm, checkLoginPrompt(tin, name), () => didox.checkLogin(tin))
    },

    async createDrafts(payload: unknown): Promise<StartDraftsResult> {
      const { month, lenderIds } = (payload ?? {}) as { month?: unknown; lenderIds?: unknown }
      if (typeof month !== 'string' || !MONTH.test(month)) throw new Error('Invalid month')
      const lenders =
        lenderIds === 'all'
          ? ('all' as const)
          : Array.isArray(lenderIds) && lenderIds.length > 0 && lenderIds.length <= MAX_LENDERS && lenderIds.every((id) => typeof id === 'string' && UUID.test(id))
            ? (lenderIds as string[])
            : null
      if (lenders === null) throw new Error('Invalid lenderIds')
      const didox = deps.didox
      if (!didox) return UNAVAILABLE
      const firms = lenders === 'all' ? 'all' : ((await deps.lenderNames(month, lenders).catch(() => null)) ?? lenders.length)
      return confirmed(deps.confirm, draftsPrompt(month, firms), async () => {
        // Best effort: without a key the run refuses with ROBOT_TOKEN_MISSING, which tells the person what to do.
        await deps.prepareRobot().catch(() => undefined)
        return didox.createDrafts({ month, lenderIds: lenders })
      })
    },
  }
}

export type DidoxRequests = ReturnType<typeof createDidoxRequests>
