// M13 §4.4 / §6 (13b) — the one-time move of a desktop's data to the shared server (docs/runbooks/server-setup.md §6).
//
//   node apps/api/scripts/migrate-data.ts export --userdata <copy of userData> --install <computer name> --out <file.sql>
//     With the desktop app CLOSED, on a COPY of its data folder: reads <userData>/db (PGlite — opened directly, never
//     through PrismaService, which would run migrations on it), didox-skips.json and didox-runs/*.json, and writes ONE
//     SQL file that loads everything in a single transaction and refuses a target that already holds data.
//
//   TARGET_SECRET=<server ROBOT_SECRET or JWT_SECRET> node apps/api/scripts/migrate-data.ts verify \
//     --userdata <copy of userData> --install <computer name> --target https://<server> -- <command that runs psql>
//     The 13b gate ("serverdagi raqamlar bugungi bilan bir xil"). Starts the built API (pnpm --filter api build) on a
//     throwaway copy of <userData>/db, asks it and the server the same questions through the same calculation core, holds
//     the server's Didox flags against the files, and compares row counts through the psql command after `--` (SQL on
//     stdin, -tA output). Exits non-zero on any difference.
//
// One file on purpose: node runs it as is (type stripping), and a script cannot import a sibling .ts module without a
// tsconfig change that would also change how Prisma generates the client.
import { type ChildProcess, spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { PGlite } from '@electric-sql/pglite';
import { hash } from '@node-rs/argon2';

// ---- flags: the accountant's skips (didox-skips.json) and every unresolved needs-check the run journal
// (didox-runs/*.json) would still show, as didox_invoice_flag rows. Shapes mirror apps/desktop/src/didox/journal.ts
// and skips.ts (only what is read here).

export interface JournalInvoice {
  contractId: string;
  state: string;
  code?: string;
  message?: string;
  didoxId?: string;
  candidateIds?: string[];
  resolved?: boolean;
}

export interface RunJournal {
  runId: string;
  month: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  firms: { invoices: JournalInvoice[] }[];
}

export type FlagState = 'needs_check' | 'skipped';

/** One row of `didox_invoice_flag`, minus what the SQL fills in itself (id, created_by_install, resolved_at). */
export interface FlagRow {
  contractId: string;
  month: string;
  state: FlagState;
  code: string;
  message: string;
  didoxDocumentId: string | null;
  /** NULL for a skip, an array (maybe empty) for a needs-check — what the API's DidoxFlagsService writes. */
  candidateIds: string[] | null;
  runId: string | null;
  /** ISO timestamp: when the run that last said so finished (needs-check), or when the accountant skipped. */
  createdAt: string;
}

/** The API's own wording for a skip (apps/api/src/didox-flags/didox-flag.ts). */
export const SKIP = { code: 'SKIPPED_BY_USER', message: "Buxgalter bu fakturani shu oy uchun o'tkazib yubordi" } as const;

/** File names the desktop treats as run journals (journal.ts RUN_ID + ".json"). */
export const RUN_FILE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z-[0-9a-f]{4}\.json$/;
const SKIP_KEY = /^(\d{4}-(?:0[1-9]|1[0-2]))\/(.+)$/;

/** Column sizes from migration 20261015120000_didox_invoice_flag. */
const LIMITS = { code: 50, message: 1000, didoxDocumentId: 100, runId: 100 } as const;

/** The desktop's own check (journal.ts isJournal): anything else is a damaged file it ignores. */
export function isJournal(value: unknown): value is RunJournal {
  const j = value as RunJournal | null;
  return !!j && typeof j === 'object' && typeof j.runId === 'string' && typeof j.month === 'string' && Array.isArray(j.firms);
}

/**
 * Work the desktop app does by itself when it next opens: a run still marked `running` (the app died mid-run — its
 * interrupted save is not yet a needs-check) and a found Didox ID not yet sent to the API. Moving before that would
 * lose exactly the invoices that need a person, so the export refuses until the app has been opened once.
 */
export function pendingJournalWork(journals: RunJournal[]): string[] {
  return journals.flatMap((j) => [
    ...(j.status === 'running' ? [`run ${j.runId} is still marked running`] : []),
    ...j.firms.flatMap((firm) =>
      firm.invoices
        .filter((invoice) => invoice.state === 'id_found')
        .map((invoice) => `run ${j.runId}: contract ${invoice.contractId} has a Didox ID not yet sent to the API`),
    ),
  ]);
}

/**
 * Every unresolved needs-check, per month — the desktop's `journal.flags(month)` for every month the journals have:
 * runs in id (time) order, and a later run's word on an invoice replaces an earlier one's.
 */
export function needsCheckFlags(journals: RunJournal[]): FlagRow[] {
  const ordered = [...journals].sort((a, b) => (a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0));
  const months = [...new Set(ordered.map((j) => j.month))].sort();
  return months.flatMap((month) => {
    const byContract = new Map<string, FlagRow>();
    for (const journal of ordered.filter((j) => j.month === month)) {
      for (const invoice of journal.firms.flatMap((firm) => firm.invoices)) {
        if (invoice.state !== 'needs_check' || invoice.resolved) {
          byContract.delete(invoice.contractId); // a later run settled it
          continue;
        }
        byContract.set(invoice.contractId, {
          contractId: invoice.contractId,
          month,
          state: 'needs_check',
          code: invoice.code ?? 'UNEXPECTED',
          message: invoice.message ?? '',
          didoxDocumentId: invoice.didoxId ?? null,
          candidateIds: invoice.candidateIds ?? [],
          runId: journal.runId,
          createdAt: journal.finishedAt ?? journal.startedAt,
        });
      }
    }
    return [...byContract.values()];
  });
}

export interface SkipResult {
  flags: FlagRow[];
  /** Keys the desktop never reads (not `yyyy-mm/<contractId>`), so nothing is lost by leaving them. */
  ignored: string[];
  /** Entries the desktop does honour but that cannot be written as they are — the export stops on these. */
  invalid: string[];
}

/** `didox-skips.json`: `{ "yyyy-mm/<contractId>": { at, note? } }`. */
export function skipFlags(skips: Record<string, unknown>): SkipResult {
  const result: SkipResult = { flags: [], ignored: [], invalid: [] };
  for (const [key, value] of Object.entries(skips).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const match = SKIP_KEY.exec(key);
    if (!match) {
      result.ignored.push(key);
      continue;
    }
    const at = (value as { at?: unknown } | null)?.at;
    if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) {
      result.invalid.push(`${key}: no valid "at" time`);
      continue;
    }
    result.flags.push({
      contractId: match[2]!,
      month: match[1]!,
      state: 'skipped',
      code: SKIP.code,
      message: SKIP.message,
      didoxDocumentId: null,
      candidateIds: null,
      runId: null,
      createdAt: at,
    });
  }
  return result;
}

/** Values the columns would refuse; the export stops rather than load half a story. */
export function flagProblems(flags: FlagRow[]): string[] {
  return flags.flatMap((flag) => {
    const where = `${flag.month}/${flag.contractId} (${flag.state})`;
    const tooLong = (field: keyof typeof LIMITS, value: string | null) =>
      value !== null && value.length > LIMITS[field] ? [`${where}: ${field} is longer than ${LIMITS[field]}`] : [];
    return [
      ...tooLong('code', flag.code),
      ...tooLong('message', flag.message),
      ...tooLong('didoxDocumentId', flag.didoxDocumentId),
      ...tooLong('runId', flag.runId),
      ...(Number.isNaN(Date.parse(flag.createdAt)) ? [`${where}: no valid time`] : []),
    ];
  });
}

/** Flags whose contract is in the database, and the ones that would break the foreign key (reported, not moved). */
export function splitByContract(flags: FlagRow[], contractIds: ReadonlySet<string>): { kept: FlagRow[]; orphans: FlagRow[] } {
  return {
    kept: flags.filter((flag) => contractIds.has(flag.contractId)),
    orphans: flags.filter((flag) => !contractIds.has(flag.contractId)),
  };
}

/** What `GET /api/didox-flags?month=` should answer once the flags are on the server (didox-flag.ts invoiceFlags). */
export function expectedFlagView(flags: FlagRow[], createdByInstall: string): Record<string, Record<string, unknown>> {
  const view: Record<string, Record<string, unknown>> = {};
  for (const flag of flags) {
    const at = new Date(flag.createdAt).toISOString();
    const entry =
      flag.state === 'skipped'
        ? { skipped: { at } }
        : {
            needsCheck: {
              ...(flag.runId === null ? {} : { runId: flag.runId }),
              code: flag.code,
              message: flag.message,
              ...(flag.didoxDocumentId === null ? {} : { didoxId: flag.didoxDocumentId }),
              ...(flag.candidateIds?.length ? { candidateIds: flag.candidateIds } : {}),
              at,
              createdByInstall,
            },
          };
    view[flag.contractId] = { ...view[flag.contractId], ...entry };
  }
  return view;
}

// ---- sql: values arrive as the source database's own text (decimals, dates, timestamps cast to text there), so
// nothing is re-interpreted on the way — postgres parses them back into the same column types.

/**
 * Data tables in foreign-key order, with their columns exactly as the migrations create them; `timestamps` are the
 * TIMESTAMPTZ ones (see appTimestamp).
 */
export const TABLES = [
  {
    name: 'companies',
    columns: ['id', 'name', 'address', 'tin', 'vat_reg_code', 'bank_account', 'mfo', 'created_at', 'updated_at'],
    timestamps: ['created_at', 'updated_at'],
  },
  {
    name: 'contracts',
    columns: ['id', 'number', 'signed_on', 'lender_id', 'borrower_id', 'limit_amount', 'start_date', 'end_date', 'created_at', 'updated_at'],
    timestamps: ['created_at', 'updated_at'],
  },
  {
    name: 'rate_changes',
    columns: ['id', 'contract_id', 'rate_percent', 'changed_on', 'effective_from', 'created_at'],
    timestamps: ['created_at'],
  },
  {
    name: 'operations',
    columns: ['id', 'contract_id', 'date', 'type', 'amount', 'note', 'created_at', 'updated_at'],
    timestamps: ['created_at', 'updated_at'],
  },
  {
    name: 'invoice_drafts',
    columns: ['id', 'contract_id', 'month', 'amount', 'didox_document_id', 'drafted_at', 'created_at', 'updated_at', 'source'],
    timestamps: ['drafted_at', 'created_at', 'updated_at'],
  },
] as const;

export type Table = (typeof TABLES)[number];

export const FLAG_TABLE = 'didox_invoice_flag';
const FLAG_COLUMNS = ['id', 'contract_id', 'month', 'state', 'code', 'message', 'didox_document_id', 'candidate_ids', 'run_id',
  'created_by_install', 'created_at', 'resolved_at'] as const;

/** Every table the load fills; it refuses to run unless all of them are empty. */
export const LOADED_TABLES = [...TABLES.map((t) => t.name), FLAG_TABLE];

export type TableName = Table['name'];
/** A row as the source's text values, in the table's column order; null is SQL NULL. */
export type Row = (string | null)[];

/**
 * A desktop timestamp as the moment the app means by it. The desktop's Prisma adapter (pglite-prisma-adapter) writes a
 * DateTime as its UTC wall-clock text *without* an offset, so PGlite stores it in its session time zone — the computer's
 * (Etc/GMT-5 in Tashkent) — and reads it back by replacing whatever offset comes out with +00:00. The stored instant is
 * therefore off by the computer's offset, while the app shows the right time. The server must get what the app shows:
 * the same text, offset replaced by +00 (the adapter's own normalize_timestampz).
 */
export function appTimestamp(text: string): string {
  return text.replace(/[+-]\d{2}(:\d{2})?$/, '+00');
}

/**
 * A string constant for `standard_conforming_strings = on` (set at the top of the file): only the quote is special.
 * A NUL cannot be stored in postgres text at all, so it can only mean a damaged value.
 */
export function literal(value: string | null): string {
  if (value === null) return 'NULL';
  if (value.includes('\0')) throw new Error('A value contains a NUL character; postgres cannot store it');
  return `'${value.replaceAll("'", "''")}'`;
}

export function textArray(values: string[] | null): string {
  if (values === null) return 'NULL';
  return `ARRAY[${values.map(literal).join(', ')}]::text[]`;
}

const insert = (table: string, columns: readonly string[], values: string[]) =>
  `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${values.join(', ')});`;

function flagInsert(flag: FlagRow, createdByInstall: string): string {
  return insert(FLAG_TABLE, FLAG_COLUMNS, [
    'gen_random_uuid()',
    literal(flag.contractId),
    literal(flag.month),
    literal(flag.state),
    literal(flag.code),
    literal(flag.message),
    literal(flag.didoxDocumentId),
    textArray(flag.candidateIds),
    literal(flag.runId),
    literal(createdByInstall),
    literal(flag.createdAt),
    'NULL',
  ]);
}

export interface ExportInput {
  rows: Record<TableName, Row[]>;
  flags: FlagRow[];
  createdByInstall: string;
  /** Shown in the header only. */
  generatedAt: string;
}

/** Row counts the file inserts, per table — the file checks them itself before it commits. */
export function expectedCounts(input: Pick<ExportInput, 'rows' | 'flags'>): Record<string, number> {
  return {
    ...Object.fromEntries(TABLES.map((t) => [t.name, input.rows[t.name].length])),
    [FLAG_TABLE]: input.flags.length,
  };
}

/**
 * The whole move as one transaction. It starts by refusing a target that already holds data (so loading twice, or
 * into the live server, changes nothing) and ends by checking the row counts, so a short or doubled file cannot commit.
 */
export function buildSql(input: ExportInput): string {
  for (const table of TABLES) {
    const bad = input.rows[table.name].find((row) => row.length !== table.columns.length);
    if (bad) throw new Error(`${table.name}: a row has ${bad.length} values, the table has ${table.columns.length} columns`);
  }
  const counts = expectedCounts(input);
  const notEmpty = LOADED_TABLES.map((t) => `EXISTS (SELECT 1 FROM "${t}")`).join(' OR ');
  const countsDiffer = LOADED_TABLES.map((t) => `(SELECT count(*) FROM "${t}") <> ${counts[t]}`).join('\n     OR ');

  return [
    '-- Moliyaviy yordam: one-time data move from a desktop database to the shared server (M13 §4.4).',
    `-- Generated ${input.generatedAt}; Didox flags recorded as install ${JSON.stringify(input.createdByInstall)}.`,
    `-- Rows: ${LOADED_TABLES.map((t) => `${t} ${counts[t]}`).join(', ')}.`,
    "-- Load with psql -v ON_ERROR_STOP=1 (docs/runbooks/server-setup.md, 'Ma'lumotni ko'chirish').",
    '\\set ON_ERROR_STOP on',
    "SET client_encoding = 'UTF8';",
    'SET standard_conforming_strings = on;',
    'BEGIN;',
    'DO $guard$ BEGIN',
    `  IF ${notEmpty} THEN`,
    "    RAISE EXCEPTION 'Target database is not empty: the move only goes into a freshly migrated database. Nothing was changed.';",
    '  END IF;',
    'END $guard$;',
    ...TABLES.flatMap((table) => [
      `-- ${table.name}`,
      ...input.rows[table.name].map((row) => insert(table.name, table.columns, row.map(literal))),
    ]),
    `-- ${FLAG_TABLE}`,
    ...input.flags.map((flag) => flagInsert(flag, input.createdByInstall)),
    'DO $check$ BEGIN',
    `  IF ${countsDiffer} THEN`,
    "    RAISE EXCEPTION 'Row counts after the load differ from the export. Nothing was changed.';",
    '  END IF;',
    'END $check$;',
    'COMMIT;',
    '',
  ].join('\n');
}

// ---- compare: lists of records are matched by id (or contractId), not by position — the two databases may return
// equal rows in another order, and one missing row must show as one difference, not shift every row after it.

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const recordKey = (value: Json): string | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const key = value.id ?? value.contractId;
  return typeof key === 'string' ? key : undefined;
};

const keyed = (items: Json[]): Map<string, Json> | undefined => {
  const keys = items.map(recordKey);
  if (!keys.every((k) => k !== undefined)) return undefined;
  const map = new Map(items.map((item, i) => [keys[i]!, item]));
  return map.size === items.length ? map : undefined; // a repeated id is not a set of records: compare by position
};

const show = (value: Json | undefined) => (value === undefined ? '(missing)' : JSON.stringify(value));

const isObject = (value: Json | undefined): value is { [key: string]: Json } =>
  !!value && typeof value === 'object' && !Array.isArray(value);

function arrayDifferences(source: Json[], target: Json[], path: string): string[] {
  const s = keyed(source);
  const t = keyed(target);
  if (s && t) {
    const keys = [...new Set([...s.keys(), ...t.keys()])].sort();
    return keys.flatMap((k) => differences(s.get(k), t.get(k), `${path}[id=${k}]`));
  }
  const length = Math.max(source.length, target.length);
  return Array.from({ length }, (_, i) => differences(source[i], target[i], `${path}[${i}]`)).flat();
}

/** Every place the two values differ, as `path: source → target`; empty when they are equal. */
export function differences(source: Json | undefined, target: Json | undefined, path = '$'): string[] {
  if (Array.isArray(source) && Array.isArray(target)) return arrayDifferences(source, target, path);
  if (isObject(source) && isObject(target)) {
    const keys = [...new Set([...Object.keys(source), ...Object.keys(target)])].sort();
    return keys.flatMap((k) => differences(source[k], target[k], `${path}.${k}`));
  }
  return source === target ? [] : [`${path}: ${show(source)} → ${show(target)}`];
}

// ---- source: a COPY of a desktop's userData folder, read the same way by export and verify

export interface Source {
  rows: Record<TableName, Row[]>;
  /** Flags to move: their contract is in the database. */
  flags: FlagRow[];
  /** Flags whose contract is not in the database — reported, not moved (the foreign key would refuse them). */
  orphans: FlagRow[];
  journalsRead: number;
  /** Journal files the desktop itself would skip as damaged. */
  damagedJournals: string[];
  /** Skip keys the desktop never reads. */
  ignoredSkipKeys: string[];
  /** Anything that makes the move unsafe; the export refuses while this is not empty. */
  blockers: string[];
}

/** Columns of a source table, so a desktop on another schema version is refused instead of half-copied. */
async function assertColumns(db: PGlite, table: string, expected: readonly string[]): Promise<void> {
  const { rows } = await db.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  const actual = rows.map((r) => r.column_name).sort();
  const wanted = [...expected].sort();
  if (actual.join() !== wanted.join()) {
    throw new Error(`source table ${table} has columns [${actual.join(', ')}], expected [${wanted.join(', ')}] — update the desktop app first`);
  }
}

/**
 * Every value as the source's own text, so decimals and dates stay exactly what was stored. Timestamps are taken as the
 * desktop app itself reads them (see appTimestamp), in PGlite's default session time zone — the one the app wrote with.
 */
async function readTable(db: PGlite, table: Table): Promise<Row[]> {
  const select = table.columns.map((c, i) => `"${c}"::text AS c${i}`).join(', ');
  const { rows } = await db.query<Record<string, string | null>>(`SELECT ${select} FROM "${table.name}" ORDER BY "id"`);
  const timestamps: readonly string[] = table.timestamps;
  return rows.map((row) =>
    table.columns.map((column, i) => {
      const value = row[`c${i}`] ?? null;
      return value !== null && timestamps.includes(column) ? appTimestamp(value) : value;
    }),
  );
}

async function readDatabase(dataDir: string): Promise<Record<TableName, Row[]>> {
  // PGlite opens a missing folder as a brand-new empty database: that would read as "no data" without a word.
  if (!existsSync(join(dataDir, 'PG_VERSION'))) throw new Error(`no PGlite database in ${dataDir}`);
  const db = new PGlite(dataDir);
  try {
    // No SET TimeZone here: appTimestamp must see the text in the zone the app's adapter wrote and reads in.
    const rows = {} as Record<TableName, Row[]>;
    for (const table of TABLES) {
      await assertColumns(db, table.name, table.columns);
      rows[table.name] = await readTable(db, table);
    }
    return rows;
  } finally {
    await db.close();
  }
}

/** The desktop's own loading rule (journal.ts loadAll): run-id file names, parsed, shape-checked; damaged ones skipped. */
function readJournals(userData: string): { journals: RunJournal[]; damaged: string[] } {
  const dir = join(userData, 'didox-runs');
  if (!existsSync(dir)) return { journals: [], damaged: [] };
  const journals: RunJournal[] = [];
  const damaged: string[] = [];
  for (const name of readdirSync(dir).filter((n) => RUN_FILE.test(n)).sort()) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(join(dir, name), 'utf8'));
      if (isJournal(parsed)) journals.push(parsed);
      else damaged.push(name);
    } catch {
      damaged.push(name);
    }
  }
  return { journals, damaged };
}

/** The app reads a damaged skips file as "nothing skipped"; moving that silently would undo the accountant's skips. */
function readSkips(userData: string): Record<string, unknown> {
  const file = join(userData, 'didox-skips.json');
  if (!existsSync(file)) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read ${file}: ${errorText(error)}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${file} is not a JSON object`);
  return parsed as Record<string, unknown>;
}

export async function readSource(userData: string): Promise<Source> {
  const rows = await readDatabase(join(userData, 'db'));
  const { journals, damaged } = readJournals(userData);
  const skips = skipFlags(readSkips(userData));
  const contractIds = new Set(rows.contracts.map((row) => row[0]!));
  const { kept, orphans } = splitByContract([...skips.flags, ...needsCheckFlags(journals)], contractIds);
  const pending = pendingJournalWork(journals);
  return {
    rows,
    flags: kept,
    orphans,
    journalsRead: journals.length,
    damagedJournals: damaged,
    ignoredSkipKeys: skips.ignored,
    blockers: [
      ...pending.map((p) => `${p} — open the desktop app once (online) so it finishes this, close it, and copy again`),
      ...skips.invalid.map((s) => `didox-skips.json ${s}`),
      ...flagProblems(kept),
    ],
  };
}

// ---- export command

/** The API's own limit for an install name (apps/api/src/didox-flags/dto/didox-flag.dto.ts). */
const MAX_INSTALL_NAME = 100;

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

function installName(value: string | undefined): string {
  const name = value?.trim() ?? '';
  if (!name) throw new Error('--install <computer name> is required');
  if (name.length > MAX_INSTALL_NAME) throw new Error(`--install is longer than ${MAX_INSTALL_NAME} characters`);
  return name;
}

async function runExport(argv: string[]): Promise<number> {
  const { values: args } = parseArgs({
    args: argv,
    options: { userdata: { type: 'string' }, install: { type: 'string' }, out: { type: 'string' } },
  });
  const install = installName(args.install);
  if (!args.userdata || !args.out) throw new Error('export --userdata <copy of userData> --install <name> --out <file.sql>');
  const out = resolve(args.out);
  if (existsSync(out)) throw new Error(`${out} already exists — choose a new file`);

  const source = await readSource(resolve(args.userdata));
  if (source.blockers.length) throw new Error(`the move is not safe yet:\n  ${source.blockers.join('\n  ')}`);
  const { rows, flags } = source;
  // 'wx': never overwrite; 0600: the file is the whole database.
  writeFileSync(out, buildSql({ rows, flags, createdByInstall: install, generatedAt: new Date().toISOString() }), {
    flag: 'wx',
    mode: 0o600,
  });

  const count = (state: FlagState) => flags.filter((f) => f.state === state).length;
  console.log(`export: wrote ${out}`);
  for (const [table, n] of Object.entries(expectedCounts({ rows, flags }))) console.log(`  ${table.padEnd(20)} ${n}`);
  console.log(`  Didox flags: ${count('skipped')} skipped, ${count('needs_check')} needs_check (install "${install}")`);
  console.log(`  run journals read: ${source.journalsRead}`);
  if (source.damagedJournals.length) console.log(`  damaged journals (ignored, as the app does): ${source.damagedJournals.join(', ')}`);
  if (source.ignoredSkipKeys.length) console.log(`  skip keys the app never reads (ignored): ${source.ignoredSkipKeys.join(', ')}`);
  for (const f of source.orphans) console.log(`  NOT moved — contract not in the database: ${f.month}/${f.contractId} (${f.state})`);
  return 0;
}

// ---- verify command

const API_ENTRY = fileURLToPath(new URL('../dist/server-entry.js', import.meta.url));
const START_TIMEOUT_MS = 60_000;
const STOP_TIMEOUT_MS = 10_000;
const TOKEN_TTL_SEC = 3600;
const MAX_SHOWN_BODY = 300;

/** HS256 session cookie, as the desktop mints it (apps/desktop/src/api/jwt.ts). */
function sessionCookie(secret: string): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  const iat = Math.floor(Date.now() / 1000);
  const signed = `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ sub: 'migrate-verify', iat, exp: iat + TOKEN_TTL_SEC })}`;
  return `session=${signed}.${createHmac('sha256', secret).update(signed).digest('base64url')}`;
}

interface Answer {
  status: number;
  body: Json;
}

function apiClient(base: string, secret: string): (path: string) => Promise<Answer> {
  const cookie = sessionCookie(secret);
  return async (path) => {
    const res = await fetch(`${base}/api${path}`, { headers: { cookie } });
    const text = await res.text();
    try {
      return { status: res.status, body: JSON.parse(text) as Json };
    } catch {
      return { status: res.status, body: text };
    }
  };
}

/** Differences between two answers; a status mismatch is one line, not a dump of the whole other body. */
export function answerDifferences(source: Answer, target: Answer): string[] {
  const shown = (a: Answer) => JSON.stringify(a.body).slice(0, MAX_SHOWN_BODY);
  if (source.status !== 200) return [`the local API answered ${source.status}: ${shown(source)}`];
  if (target.status !== 200) return [`the server answered ${target.status}: ${shown(target)}`];
  return differences(source.body, target.body);
}

/** The built API on the throwaway copy; resolves with its base URL once it listens. */
async function startLocalApi(dataDir: string, workDir: string, jwtSecret: string): Promise<{ base: string; child: ChildProcess }> {
  const env = {
    ...process.env,
    DB_DRIVER: 'pglite',
    PGLITE_DATA_DIR: dataDir,
    DATABASE_URL: '',
    PORT: '0',
    AUTH_USERNAME: 'migrate-verify',
    // Nobody logs in to this API: the password is random and thrown away.
    AUTH_PASSWORD_HASH: await hash(randomBytes(24).toString('hex')),
    JWT_SECRET: jwtSecret,
    ROBOT_SECRET: '',
    COOKIE_SECURE: 'false',
    WEB_ROOT: '',
    TRUST_PROXY: '0',
  };
  // cwd: the throwaway folder, so no .env file of the repo is picked up.
  const child = spawn(process.execPath, [API_ENTRY], { cwd: workDir, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stderr?.on('data', (chunk: Buffer) => (log += chunk.toString()));
  const port = await new Promise<number>((done, reject) => {
    const timer = setTimeout(() => reject(new Error(`the local API did not start in ${START_TIMEOUT_MS / 1000} s`)), START_TIMEOUT_MS);
    child.stdout?.on('data', (chunk: Buffer) => {
      log += chunk.toString();
      const match = /LISTENING (\d+)/.exec(log); // server-entry.js reports its port when it is not forked
      if (match) {
        clearTimeout(timer);
        done(Number(match[1]));
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`the local API exited (${code}):\n${log}`));
    });
  });
  return { base: `http://127.0.0.1:${port}`, child };
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  const exited = new Promise<void>((done) => child.once('exit', () => done()));
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), STOP_TIMEOUT_MS);
  await exited;
  clearTimeout(timer);
}

/** Row counts on the server, through the given psql command (SQL on stdin, `table|count` lines out). */
async function serverCounts(command: string[]): Promise<Record<string, number>> {
  const sql = `${LOADED_TABLES.map((t) => `SELECT '${t}', count(*) FROM "${t}"`).join(' UNION ALL ')};\n`;
  const child = spawn(command[0]!, command.slice(1), { stdio: ['pipe', 'pipe', 'inherit'] });
  let out = '';
  child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()));
  child.stdin.end(sql);
  // 'close', not 'exit': the output may still be in flight when the process has exited.
  const code = await new Promise<number | null>((done, reject) => {
    child.once('error', reject);
    child.once('close', done);
  });
  if (code !== 0) throw new Error(`the psql command exited with ${code}`);
  return Object.fromEntries(
    out.split('\n').flatMap((line) => {
      const match = /^(\w+)\|(\d+)$/.exec(line.trim());
      return match ? [[match[1]!, Number(match[2])]] : [];
    }),
  );
}

/** Asks both APIs everything the 13b gate is about; returns the number of differences. */
async function compareApis(source: Source, local: (path: string) => Promise<Answer>, server: (path: string) => Promise<Answer>, install: string) {
  let found = 0;
  const report = (label: string, lines: string[], detail = '') => {
    found += lines.length;
    console.log(`${lines.length ? 'DIFF' : 'OK  '} ${label}${detail}`);
    for (const line of lines) console.log(`       ${line}`);
  };
  const compare = async (path: string): Promise<Json> => {
    const [s, t] = await Promise.all([local(path), server(path)]);
    report(`GET ${path}`, answerDifferences(s, t), Array.isArray(s.body) ? ` (${s.body.length} records)` : '');
    return s.body;
  };

  await compare('/companies');
  const contracts = await compare('/contracts');
  const list = Array.isArray(contracts) ? (contracts as { id: string; startDate: string }[]) : [];
  for (const { id } of list) {
    await compare(`/contracts/${id}`);
    await compare(`/contracts/${id}/operations`);
  }
  const invoices = (await compare('/invoices')) as { months?: string[] } | null;
  const months = invoices?.months ?? [];
  for (const month of months) await compare(`/invoices?month=${month}`);
  if (list.length) {
    const from = list.map((c) => c.startDate.slice(0, 7)).sort()[0]!;
    const to = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date()).slice(0, 7);
    await compare(`/reports/period?from=${from}&to=${to}`);
  }
  // The local API never had the flags (they lived in files): the server is held against the files themselves.
  for (const month of [...new Set([...months, ...source.flags.map((f) => f.month)])].sort()) {
    const expected = expectedFlagView(source.flags.filter((f) => f.month === month), install) as Json;
    report(`GET /didox-flags?month=${month} (server vs files)`, answerDifferences({ status: 200, body: expected }, await server(`/didox-flags?month=${month}`)));
  }
  return found;
}

async function runVerify(argv: string[]): Promise<number> {
  const { values: args, positionals } = parseArgs({
    args: argv,
    options: { userdata: { type: 'string' }, install: { type: 'string' }, target: { type: 'string' } },
    allowPositionals: true,
  });
  const install = installName(args.install);
  const secret = process.env.TARGET_SECRET ?? '';
  if (!args.userdata || !args.target || !positionals.length || !secret) {
    throw new Error('TARGET_SECRET=<secret> verify --userdata <copy> --install <name> --target https://<server> -- <psql command>');
  }
  if (!existsSync(API_ENTRY)) throw new Error(`${API_ENTRY} is missing — run: pnpm --filter api build`);
  const userData = resolve(args.userdata);
  const source = await readSource(userData);

  const work = mkdtempSync(join(tmpdir(), 'moliya-verify-'));
  let child: ChildProcess | undefined;
  let found: number;
  try {
    // The API runs in-app migrations on what it opens: it gets its own copy, never the one the export read.
    cpSync(join(userData, 'db'), join(work, 'db'), { recursive: true });
    const localSecret = randomBytes(32).toString('hex');
    const started = await startLocalApi(join(work, 'db'), work, localSecret);
    child = started.child;
    found = await compareApis(source, apiClient(started.base, localSecret), apiClient(args.target.replace(/\/+$/, ''), secret), install);
  } finally {
    if (child) await stop(child);
    rmSync(work, { recursive: true, force: true });
  }

  const expected = expectedCounts(source);
  const actual = await serverCounts(positionals);
  console.log(`${'table'.padEnd(20)} ${'source'.padStart(8)} ${'server'.padStart(8)}`);
  for (const table of LOADED_TABLES) {
    const same = expected[table] === actual[table];
    if (!same) found++;
    console.log(`${table.padEnd(20)} ${String(expected[table]).padStart(8)} ${String(actual[table] ?? '?').padStart(8)}${same ? '' : '  <- differs'}`);
  }
  if (source.orphans.length) console.log(`note: ${source.orphans.length} Didox flag(s) were not moved — their contract is not in the database`);
  console.log(found ? `verify: ${found} difference(s)` : 'verify: no differences');
  return found ? 1 : 0;
}

if (import.meta.main) {
  const [command, ...rest] = process.argv.slice(2);
  const run = command === 'export' ? runExport : command === 'verify' ? runVerify : undefined;
  if (!run) {
    console.error('usage: migrate-data.ts export … | verify … (see the top of the file)');
    process.exit(2);
  }
  // 1: differences found; 2: could not run (usage, unsafe source, unreachable server…) — neither is a pass.
  process.exitCode = await run(rest).catch((error: unknown) => {
    console.error(`${command}: ${errorText(error)}`);
    return 2;
  });
}
