import { flagsByContract, StoredFlag } from './didox-flag.js';

const at = new Date('2026-10-01T06:00:00.000Z');

const flag = (overrides: Partial<StoredFlag>): StoredFlag => ({
  contractId: 'c1',
  state: 'needs_check',
  code: 'SAVE_FAILED',
  message: 'Saqlanmadi',
  didoxDocumentId: null,
  candidateIds: null,
  runId: null,
  createdByInstall: 'pc-1',
  createdAt: at,
  ...overrides,
});

describe('flagsByContract', () => {
  it('is empty without flags', () => {
    expect(flagsByContract([])).toEqual({});
  });

  it('shows a skip as just its time', () => {
    expect(flagsByContract([flag({ state: 'skipped', code: 'SKIPPED_BY_USER' })])).toEqual({
      c1: { skipped: { at: '2026-10-01T06:00:00.000Z' } },
    });
  });

  it('shows a needs-check in the web shape, omitting what was not recorded', () => {
    expect(flagsByContract([flag({})])).toEqual({
      c1: { needsCheck: { code: 'SAVE_FAILED', message: 'Saqlanmadi', createdByInstall: 'pc-1', at: '2026-10-01T06:00:00.000Z' } },
    });
    expect(
      flagsByContract([flag({ runId: 'run-1', didoxDocumentId: 'ABC', candidateIds: ['ABC', 'DEF'] })]).c1.needsCheck,
    ).toEqual({
      runId: 'run-1',
      code: 'SAVE_FAILED',
      message: 'Saqlanmadi',
      didoxId: 'ABC',
      candidateIds: ['ABC', 'DEF'],
      createdByInstall: 'pc-1',
      at: '2026-10-01T06:00:00.000Z',
    });
  });

  it('treats an empty candidate list as none', () => {
    expect(flagsByContract([flag({ candidateIds: [] })]).c1.needsCheck).not.toHaveProperty('candidateIds');
  });

  it('groups both states of one contract and keeps contracts apart', () => {
    const flags = flagsByContract([flag({ state: 'skipped' }), flag({}), flag({ contractId: 'c2' })]);
    expect(Object.keys(flags).sort()).toEqual(['c1', 'c2']);
    expect(Object.keys(flags.c1).sort()).toEqual(['needsCheck', 'skipped']);
    expect(Object.keys(flags.c2)).toEqual(['needsCheck']);
  });
});
