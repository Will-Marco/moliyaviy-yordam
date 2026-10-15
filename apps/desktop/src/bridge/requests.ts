import type { CheckLoginResult, StartDraftsResult } from '../didox/run.js'
import { type CANCELLED, checkLoginPrompt, type Confirm, type ConfirmFirm, confirmed, draftsPrompt, removePasswordPrompt } from './confirm.js'

/*
 * What the page may *ask* the robot to do (CONSTITUTION §13, M13), and the removal of a saved ERI password, which
 * would otherwise quietly stop the robot (security review L1). Every request is validated, then confirmed in a
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
  /** Deletes the firm's saved ERI password from this computer's encrypted store. */
  removePassword(tin: string): Promise<void>
  /**
   * STIR → the organisation on the firm's E-IMZO key, for the STIRs that have one — read on this computer, unlike
   * anything the page or the server sends.
   */
  firmNames(tins: string[]): Promise<ReadonlyMap<string, string>>
  /**
   * The picked lenders' STIRs as the server lists them for the month, or null when that cannot be read. Only these
   * digits are taken from the server for the confirmation; the names next to them come from `firmNames`.
   */
  lenderTins(month: string, ids: string[]): Promise<string[] | null>
}

export function createDidoxRequests(deps: DidoxRequestDeps) {
  /** Firms for a confirmation; E-IMZO being down only costs the names. */
  const named = async (tins: string[]): Promise<ConfirmFirm[]> => {
    const names = await deps.firmNames(tins).catch(() => new Map<string, string>())
    return tins.map((tin) => ({ tin, name: names.get(tin) ?? null }))
  }

  /** The picked lenders, or just how many: a server answer that is not a list of STIRs is not shown at all. */
  const pickedFirms = async (month: string, ids: string[]): Promise<ConfirmFirm[] | number> => {
    const tins = await deps.lenderTins(month, ids).catch(() => null)
    if (!tins || !tins.every((tin) => typeof tin === 'string' && TIN.test(tin))) return ids.length
    return named([...new Set(tins)])
  }

  return {
    async checkLogin(tin: unknown): Promise<CheckLoginResult> {
      if (typeof tin !== 'string' || !TIN.test(tin)) throw new Error('Invalid STIR')
      const didox = deps.didox
      if (!didox) return UNAVAILABLE
      const [firm] = await named([tin])
      return confirmed(deps.confirm, checkLoginPrompt(tin, firm?.name ?? null), () => didox.checkLogin(tin))
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
      const firms = lenders === 'all' ? 'all' : await pickedFirms(month, lenders)
      return confirmed(deps.confirm, draftsPrompt(month, firms), async () => {
        // Best effort: without a key the run refuses with ROBOT_TOKEN_MISSING, which tells the person what to do.
        await deps.prepareRobot().catch(() => undefined)
        return didox.createDrafts({ month, lenderIds: lenders })
      })
    },

    /** Nothing on success; CANCELLED, as for a Didox start, when the person did not confirm. */
    async removePassword(tin: unknown): Promise<void | typeof CANCELLED> {
      if (typeof tin !== 'string' || !TIN.test(tin)) throw new Error('Invalid STIR')
      const [firm] = await named([tin])
      return confirmed(deps.confirm, removePasswordPrompt(tin, firm?.name ?? null), () => deps.removePassword(tin))
    },
  }
}

export type DidoxRequests = ReturnType<typeof createDidoxRequests>
