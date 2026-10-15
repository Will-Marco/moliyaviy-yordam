/*
 * M13 §4.1: the Didox robot's per-invoice flags, kept on the server so every accountant sees them. The view mirrors
 * the web's `DidoxInvoiceFlags` (apps/web/src/lib/desktop.ts), plus who recorded a needs-check — only that computer
 * can recover an interrupted save (M13 §4.2).
 */

export const FLAG_STATES = ['needs_check', 'skipped'] as const;
export type FlagState = (typeof FLAG_STATES)[number];

/** A skip is a person's decision, not a robot finding; it carries the desktop's own code and wording for it. */
export const SKIP = { code: 'SKIPPED_BY_USER', message: "Buxgalter bu fakturani shu oy uchun o'tkazib yubordi" } as const;

export interface StoredFlag {
  contractId: string;
  /** Database value; the column's CHECK keeps it to FlagState. */
  state: string;
  code: string;
  message: string;
  didoxDocumentId: string | null;
  /** The column is nullable even though Prisma types a list as never null. */
  candidateIds: string[] | null;
  runId: string | null;
  createdByInstall: string;
  createdAt: Date;
}

export interface NeedsCheckView {
  runId?: string;
  code: string;
  message: string;
  didoxId?: string;
  candidateIds?: string[];
  at: string;
  createdByInstall: string;
}

export interface InvoiceFlagsView {
  skipped?: { at: string };
  needsCheck?: NeedsCheckView;
}

function needsCheckView(flag: StoredFlag): NeedsCheckView {
  return {
    ...(flag.runId === null ? {} : { runId: flag.runId }),
    code: flag.code,
    message: flag.message,
    ...(flag.didoxDocumentId === null ? {} : { didoxId: flag.didoxDocumentId }),
    ...(flag.candidateIds?.length ? { candidateIds: flag.candidateIds } : {}),
    at: flag.createdAt.toISOString(),
    createdByInstall: flag.createdByInstall,
  };
}

/** One contract's unresolved flags (at most one per state — the partial unique index). */
export function invoiceFlags(flags: StoredFlag[]): InvoiceFlagsView {
  return flags.reduce<InvoiceFlagsView>(
    (view, flag) =>
      flag.state === 'skipped'
        ? { ...view, skipped: { at: flag.createdAt.toISOString() } }
        : { ...view, needsCheck: needsCheckView(flag) },
    {},
  );
}

/** A month's unresolved flags by contract ID. */
export function flagsByContract(flags: StoredFlag[]): Record<string, InvoiceFlagsView> {
  const contractIds = [...new Set(flags.map((flag) => flag.contractId))];
  return Object.fromEntries(
    contractIds.map((contractId) => [contractId, invoiceFlags(flags.filter((flag) => flag.contractId === contractId))]),
  );
}
