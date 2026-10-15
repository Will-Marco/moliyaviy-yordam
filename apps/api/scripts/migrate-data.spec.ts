import { PGlite } from '@electric-sql/pglite';
import {
  answerDifferences,
  appTimestamp,
  buildSql,
  differences,
  expectedFlagView,
  flagProblems,
  isJournal,
  literal,
  needsCheckFlags,
  pendingJournalWork,
  type Row,
  RUN_FILE,
  type RunJournal,
  SKIP,
  skipFlags,
  splitByContract,
  type TableName,
  textArray,
} from './migrate-data.js';

const A = '01a135e6-edeb-71fb-ac5f-2547c1cfb7e9';
const B = '01a134fb-18aa-76ea-a335-4b8bc6f2d4f1';
const DIDOX_ID = '0123456789ABCDEF0123456789ABCDEF';

function run(runId: string, month: string, invoices: RunJournal['firms'][number]['invoices'], extra: Partial<RunJournal> = {}): RunJournal {
  return {
    runId,
    month,
    status: 'done',
    startedAt: '2026-10-13T11:00:00.000Z',
    finishedAt: '2026-10-13T11:05:00.000Z',
    firms: [{ invoices }],
    ...extra,
  };
}

describe('needsCheckFlags (the journal.flags(month) mirror)', () => {
  it('turns an unresolved needs_check into a flag carrying the run, the reason and the Didox IDs', () => {
    const flags = needsCheckFlags([
      run('2026-10-13T11-00-00.000Z-aaaa', '2026-09', [
        { contractId: A, state: 'needs_check', code: 'SAVED_ID_AMBIGUOUS', message: 'ikki qoralama', didoxId: DIDOX_ID, candidateIds: [DIDOX_ID] },
      ]),
    ]);

    expect(flags).toEqual([
      {
        contractId: A,
        month: '2026-09',
        state: 'needs_check',
        code: 'SAVED_ID_AMBIGUOUS',
        message: 'ikki qoralama',
        didoxDocumentId: DIDOX_ID,
        candidateIds: [DIDOX_ID],
        runId: '2026-10-13T11-00-00.000Z-aaaa',
        createdAt: '2026-10-13T11:05:00.000Z',
      },
    ]);
  });

  it('leaves out resolved ones and invoices that ended well', () => {
    const flags = needsCheckFlags([
      run('2026-10-13T11-00-00.000Z-aaaa', '2026-09', [
        { contractId: A, state: 'needs_check', code: 'SAVE_FAILED', resolved: true },
        { contractId: B, state: 'marked' },
      ]),
    ]);
    expect(flags).toEqual([]);
  });

  it('lets a later run settle or replace an earlier one, whatever order the files come in', () => {
    const early = run('2026-10-13T11-00-00.000Z-aaaa', '2026-09', [
      { contractId: A, state: 'needs_check', code: 'INTERRUPTED_SAVE' },
      { contractId: B, state: 'needs_check', code: 'INTERRUPTED_SAVE' },
    ]);
    const late = run('2026-10-14T05-00-00.000Z-bbbb', '2026-09', [
      { contractId: A, state: 'marked' },
      { contractId: B, state: 'needs_check', code: 'SAVED_ID_UNKNOWN', message: 'yangi sabab' },
    ]);

    const flags = needsCheckFlags([late, early]);

    expect(flags.map((f) => [f.contractId, f.code, f.runId])).toEqual([[B, 'SAVED_ID_UNKNOWN', late.runId]]);
  });

  it('keeps months apart: a run of another month settles nothing', () => {
    const flags = needsCheckFlags([
      run('2026-10-13T11-00-00.000Z-aaaa', '2026-08', [{ contractId: A, state: 'needs_check', code: 'SAVE_FAILED' }]),
      run('2026-10-14T05-00-00.000Z-bbbb', '2026-09', [{ contractId: A, state: 'marked' }]),
    ]);
    expect(flags.map((f) => `${f.month}/${f.contractId}`)).toEqual([`2026-08/${A}`]);
  });

  it("uses the journal's defaults: no code → UNEXPECTED, no message → empty, no candidates → empty list, unfinished run → its start", () => {
    const [flag] = needsCheckFlags([
      run('2026-10-13T11-00-00.000Z-aaaa', '2026-09', [{ contractId: A, state: 'needs_check' }], { finishedAt: undefined }),
    ]);
    expect(flag).toMatchObject({
      code: 'UNEXPECTED',
      message: '',
      candidateIds: [],
      didoxDocumentId: null,
      createdAt: '2026-10-13T11:00:00.000Z',
    });
  });
});

describe('skipFlags', () => {
  it('turns every yyyy-mm/contract key into a skipped flag at the time it was set', () => {
    const { flags, ignored, invalid } = skipFlags({
      [`2026-09/${A}`]: { at: '2026-10-14T07:00:00.000Z', note: 'qo‘lda' },
      'garbage-key': { at: '2026-10-14T07:00:00.000Z' },
      [`2026-13/${A}`]: { at: '2026-10-14T07:00:00.000Z' },
    });

    expect(flags).toEqual([
      {
        contractId: A,
        month: '2026-09',
        state: 'skipped',
        code: SKIP.code,
        message: SKIP.message,
        didoxDocumentId: null,
        candidateIds: null,
        runId: null,
        createdAt: '2026-10-14T07:00:00.000Z',
      },
    ]);
    expect(ignored).toEqual([`2026-13/${A}`, 'garbage-key']);
    expect(invalid).toEqual([]);
  });

  it('refuses a skip it cannot date instead of dropping it', () => {
    expect(skipFlags({ [`2026-09/${A}`]: { at: 'kecha' }, [`2026-09/${B}`]: null }).invalid).toEqual([
      `2026-09/${B}: no valid "at" time`, // keys are walked in sorted order
      `2026-09/${A}: no valid "at" time`,
    ]);
  });
});

describe('what blocks the move', () => {
  it('names a run still marked running and an ID not yet sent to the API', () => {
    const work = pendingJournalWork([
      run('2026-10-13T11-00-00.000Z-aaaa', '2026-09', [{ contractId: A, state: 'saving' }], { status: 'running' }),
      run('2026-10-14T05-00-00.000Z-bbbb', '2026-09', [{ contractId: B, state: 'id_found', didoxId: DIDOX_ID }]),
    ]);
    expect(work).toEqual([
      'run 2026-10-13T11-00-00.000Z-aaaa is still marked running',
      `run 2026-10-14T05-00-00.000Z-bbbb: contract ${B} has a Didox ID not yet sent to the API`,
    ]);
  });

  it('flags values the columns would refuse', () => {
    const [flag] = needsCheckFlags([
      run('2026-10-13T11-00-00.000Z-aaaa', '2026-09', [{ contractId: A, state: 'needs_check', code: 'X'.repeat(51), message: 'm'.repeat(1001) }]),
    ]);
    expect(flagProblems([flag!])).toEqual([
      `2026-09/${A} (needs_check): code is longer than 50`,
      `2026-09/${A} (needs_check): message is longer than 1000`,
    ]);
  });
});

describe('splitByContract', () => {
  it('keeps flags of contracts in the database and reports the rest', () => {
    const { flags } = skipFlags({ [`2026-09/${A}`]: { at: '2026-10-14T07:00:00.000Z' }, [`2026-09/${B}`]: { at: '2026-10-14T07:00:00.000Z' } });
    const { kept, orphans } = splitByContract(flags, new Set([A]));
    expect(kept.map((f) => f.contractId)).toEqual([A]);
    expect(orphans.map((f) => f.contractId)).toEqual([B]);
  });
});

describe('expectedFlagView (what GET /api/didox-flags answers)', () => {
  it('puts both states of one invoice side by side, in the API shape', () => {
    const skip = skipFlags({ [`2026-09/${A}`]: { at: '2026-10-14T07:00:00Z' } }).flags;
    const check = needsCheckFlags([
      run('2026-10-13T11-00-00.000Z-aaaa', '2026-09', [{ contractId: A, state: 'needs_check', code: 'SAVE_FAILED', message: 'xato' }]),
    ]);

    expect(expectedFlagView([...skip, ...check], 'PC-1')).toEqual({
      [A]: {
        skipped: { at: '2026-10-14T07:00:00.000Z' },
        needsCheck: {
          runId: '2026-10-13T11-00-00.000Z-aaaa',
          code: 'SAVE_FAILED',
          message: 'xato',
          at: '2026-10-13T11:05:00.000Z',
          createdByInstall: 'PC-1',
        },
      },
    });
  });
});

describe('file recognition', () => {
  it('reads only run-id file names and journal-shaped content, as the desktop does', () => {
    expect(RUN_FILE.test('2026-10-13T11-27-29.138Z-d053.json')).toBe(true);
    expect(RUN_FILE.test('2026-10-13T11-27-29.138Z-d053.json.tmp')).toBe(false);
    expect(isJournal({ runId: 'r', month: '2026-09', firms: [] })).toBe(true);
    expect(isJournal({ runId: 'r', month: '2026-09' })).toBe(false);
  });
});

describe('literal', () => {
  it('quotes text so postgres reads back exactly the same characters', () => {
    expect(literal("Didox Қоралама'sini")).toBe("'Didox Қоралама''sini'");
    expect(literal('C:\\yo‘l\\n')).toBe("'C:\\yo‘l\\n'"); // standard strings: a backslash is just a backslash
    expect(literal('')).toBe("''");
    expect(literal(null)).toBe('NULL');
  });

  it('refuses a NUL, which postgres cannot store', () => {
    expect(() => literal('a\0b')).toThrow(/NUL/);
  });

  it('round-trips awkward text through a real postgres', async () => {
    const db = new PGlite();
    const values = ["O'ZBEK", "'';DROP TABLE x;--", 'back\\slash', 'qator\nikkinchi', '$$dollar$$', '😀 emoji'];
    const { rows } = await db.query<{ v: string }>(`SELECT unnest(${textArray(values)}) AS v`);
    expect(rows.map((r) => r.v)).toEqual(values);
    await db.close();
  });
});

describe('textArray', () => {
  it('writes NULL, an empty array, or a quoted list', () => {
    expect(textArray(null)).toBe('NULL');
    expect(textArray([])).toBe('ARRAY[]::text[]');
    expect(textArray(["a'b", 'c'])).toBe("ARRAY['a''b', 'c']::text[]");
  });
});

describe('appTimestamp (what the desktop app means by a stored timestamp)', () => {
  it("replaces the computer's offset with UTC, like the app's adapter does when it reads", () => {
    expect(appTimestamp('2026-10-13 11:17:13.496+05')).toBe('2026-10-13 11:17:13.496+00');
    expect(appTimestamp('2026-10-13 11:17:13+05:30')).toBe('2026-10-13 11:17:13+00');
    expect(appTimestamp('2026-10-13 11:17:13.4-03')).toBe('2026-10-13 11:17:13.4+00');
  });
});

const empty = (): Record<TableName, Row[]> => ({ companies: [], contracts: [], rate_changes: [], operations: [], invoice_drafts: [] });

describe('buildSql', () => {
  it('wraps everything in one transaction that refuses a non-empty target and checks its own counts', () => {
    const sql = buildSql({ rows: empty(), flags: [], createdByInstall: 'PC', generatedAt: 'now' });
    expect(sql).toMatch(/^\\set ON_ERROR_STOP on$/m);
    expect(sql.indexOf('BEGIN;')).toBeLessThan(sql.indexOf('Target database is not empty'));
    expect(sql).toContain('EXISTS (SELECT 1 FROM "didox_invoice_flag")');
    expect(sql).toContain('(SELECT count(*) FROM "companies") <> 0');
    expect(sql.trimEnd().endsWith('COMMIT;')).toBe(true);
  });

  it('inserts in foreign-key order with the exact column list', () => {
    const rows = empty();
    rows.contracts = [['c', '1/2026', '2026-01-05', 'l', 'b', '1000.00', '2026-01-05', '2027-01-05', 't', 't']];
    rows.companies = [['l', "O'ZBEK", null, '123456789', null, null, null, 't', 't']];
    const sql = buildSql({ rows, flags: [], createdByInstall: 'PC', generatedAt: 'now' });

    expect(sql.indexOf('INSERT INTO "companies"')).toBeLessThan(sql.indexOf('INSERT INTO "contracts"'));
    expect(sql).toContain(
      `INSERT INTO "companies" ("id", "name", "address", "tin", "vat_reg_code", "bank_account", "mfo", "created_at", "updated_at") VALUES ('l', 'O''ZBEK', NULL, '123456789', NULL, NULL, NULL, 't', 't');`,
    );
  });

  it('refuses a row that does not fit its table', () => {
    const rows = empty();
    rows.operations = [['only', 'three', 'values']];
    expect(() => buildSql({ rows, flags: [], createdByInstall: 'PC', generatedAt: 'now' })).toThrow(/operations: a row has 3 values/);
  });

  it('writes a flag with a new id, the install name and no resolution', () => {
    const { flags } = skipFlags({ '2026-09/c': { at: '2026-10-14T07:00:00.000Z' } });
    const sql = buildSql({ rows: empty(), flags, createdByInstall: "Ali'ning PC", generatedAt: 'now' });
    expect(sql).toContain(
      `VALUES (gen_random_uuid(), 'c', '2026-09', 'skipped', 'SKIPPED_BY_USER', 'Buxgalter bu fakturani shu oy uchun o''tkazib yubordi', NULL, NULL, NULL, 'Ali''ning PC', '2026-10-14T07:00:00.000Z', NULL);`,
    );
  });
});

describe('differences', () => {
  it('finds nothing in equal answers, whatever order the records come in', () => {
    const a = { rows: [{ contractId: 'x', amount: '1.00' }, { contractId: 'y', amount: '2.00' }], months: ['2026-09'] };
    const b = { months: ['2026-09'], rows: [{ contractId: 'y', amount: '2.00' }, { contractId: 'x', amount: '1.00' }] };
    expect(differences(a, b)).toEqual([]);
  });

  it('names the record and field that differ', () => {
    expect(differences([{ id: 'a', totals: { repaid: '1.00' } }], [{ id: 'a', totals: { repaid: '1.01' } }])).toEqual([
      '$[id=a].totals.repaid: "1.00" → "1.01"',
    ]);
  });

  it('reports a missing record once instead of shifting every record after it', () => {
    const source = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const target = [{ id: 'a' }, { id: 'c' }];
    expect(differences(source, target)).toEqual(['$[id=b]: {"id":"b"} → (missing)']);
  });

  it('keeps the order of plain lists — the months list is ordered on purpose', () => {
    expect(differences(['2026-09', '2026-08'], ['2026-08', '2026-09'])).toHaveLength(2);
  });

  it('tells a status or type change apart', () => {
    expect(differences({ status: 200, body: [] }, { status: 401, body: { message: 'x' } })).toEqual([
      '$.body: [] → {"message":"x"}',
      '$.status: 200 → 401',
    ]);
  });
});

describe('answerDifferences', () => {
  it('reports a refused request as one line instead of the whole other answer', () => {
    expect(answerDifferences({ status: 200, body: [{ id: 'a' }] }, { status: 502, body: '' })).toEqual(['the server answered 502: ""']);
    expect(answerDifferences({ status: 401, body: { message: 'x' } }, { status: 401, body: { message: 'x' } })).toEqual([
      'the local API answered 401: {"message":"x"}',
    ]);
    expect(answerDifferences({ status: 200, body: { a: 1 } }, { status: 200, body: { a: 1 } })).toEqual([]);
  });
});
