// Usage: SEED_PASSWORD='<dev password>' pnpm --filter api seed:demo
// Adds demo companies, contracts, operations, rate changes and invoice drafts through the running API
// (so every validation and calculation rule applies). Fictional firms; TINs 9000000xx. Run once.

const API = process.env.API_URL ?? 'http://localhost:3000/api';
const USERNAME = process.env.SEED_USERNAME ?? 'admin';
const PASSWORD = process.env.SEED_PASSWORD;

if (!PASSWORD) {
  console.error('SEED_PASSWORD is required (the dev login password).');
  process.exit(1);
}

let cookie = '';

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const data = res.status === 204 ? undefined : await res.json();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(data)}`);
  return data as T;
}

type Op = [date: string, type: 'D' | 'R' | 'I', amount: string, note?: string];
const TYPES = { D: 'DISBURSEMENT', R: 'PRINCIPAL_REPAYMENT', I: 'INTEREST_PAYMENT' } as const;

const companies = [
  ['GAMMA QURILISH', '900000001', "Toshkent sh., Yunusobod t., Amir Temur ko'chasi, 108"],
  ['DELTA AGRO', '900000002', "Samarqand sh., Registon ko'chasi, 12"],
  ['OMEGA LOGISTIKA', '900000003', "Toshkent sh., Sergeli t., Yangi Sergeli ko'chasi, 5"],
  ['SIGMA TEKSTIL', '900000004', "Farg'ona sh., Mustaqillik ko'chasi, 41"],
  ['ZETA SAVDO', '900000005', "Andijon sh., Navoiy shoh ko'chasi, 77"],
  ['KAPPA FARM', '900000006', "Toshkent sh., Chilonzor t., Bunyodkor shoh ko'chasi, 3"],
  ['LAMBDA ENERGO', '900000007', "Buxoro sh., Mustaqillik ko'chasi, 19"],
  ['TETA IT', '900000008', "Toshkent sh., Mirzo Ulug'bek t., Buyuk Ipak yo'li, 63"],
] as const;

interface ContractSeed {
  number: string;
  lender: number;
  borrower: number;
  signedOn: string;
  startDate: string;
  endDate: string;
  limitAmount: string;
  ratePercent: string;
  ops: Op[];
  rates?: [changedOn: string, ratePercent: string][];
}

const contracts: ContractSeed[] = [
  {
    number: '12/25', lender: 0, borrower: 1, signedOn: '2025-06-10', startDate: '2025-06-15', endDate: '2027-06-14',
    limitAmount: '500000000', ratePercent: '15',
    ops: [
      ['2025-06-15', 'D', '200000000', 'Birinchi transh'],
      ['2025-09-01', 'D', '150000000', 'Ikkinchi transh'],
      ['2025-10-05', 'I', '8000000', 'III chorak foizi'],
      ['2025-12-20', 'R', '50000000'],
      ['2026-01-10', 'I', '12000000', 'IV chorak foizi'],
      ['2026-04-08', 'I', '12000000', 'I chorak foizi'],
      ['2026-07-07', 'I', '11000000', 'II chorak foizi'],
    ],
    rates: [['2026-03-01', '17']],
  },
  {
    number: '07-MY', lender: 0, borrower: 2, signedOn: '2026-02-01', startDate: '2026-02-01', endDate: '2026-12-31',
    limitAmount: '120000000', ratePercent: '18',
    ops: [
      ['2026-02-03', 'D', '80000000'],
      ['2026-05-15', 'D', '40000000'],
      ['2026-06-30', 'I', '5000000'],
      ['2026-08-20', 'R', '30000000'],
    ],
  },
  {
    number: '3', lender: 3, borrower: 4, signedOn: '2025-11-01', startDate: '2025-11-05', endDate: '2026-11-04',
    limitAmount: '50000000', ratePercent: '12',
    ops: [
      ['2025-11-05', 'D', '50000000'],
      ['2026-03-31', 'R', '20000000'],
      ['2026-06-30', 'R', '30000000', "To'liq qaytarildi"],
      ['2026-07-15', 'I', '2000000'],
    ],
  },
  {
    number: '2026/01', lender: 5, borrower: 6, signedOn: '2026-01-15', startDate: '2026-01-20', endDate: '2027-01-19',
    limitAmount: '1000000000', ratePercent: '14',
    ops: [
      ['2026-01-20', 'D', '300000000'],
      ['2026-03-10', 'D', '300000000'],
      ['2026-06-01', 'D', '250000000'],
      ['2026-09-15', 'D', '200000000', 'Limitdan oshdi — rahbar roziligi bilan'],
    ],
    rates: [['2026-07-15', '13']],
  },
  {
    number: '45', lender: 7, borrower: 1, signedOn: '2026-04-01', startDate: '2026-04-01', endDate: '2027-03-31',
    limitAmount: '30000000', ratePercent: '20',
    ops: [
      ['2026-04-02', 'D', '30000000'],
      ['2026-07-01', 'I', '1500000'],
    ],
  },
  {
    number: '9-B', lender: 6, borrower: 3, signedOn: '2026-08-10', startDate: '2026-08-12', endDate: '2027-08-11',
    limitAmount: '75000000', ratePercent: '16',
    ops: [['2026-08-12', 'D', '75000000']],
  },
  {
    number: '101', lender: 4, borrower: 5, signedOn: '2026-09-25', startDate: '2026-10-01', endDate: '2027-09-30',
    limitAmount: '40000000', ratePercent: '15',
    ops: [['2026-10-01', 'D', '40000000']],
  },
  {
    number: '5/26', lender: 2, borrower: 7, signedOn: '2026-05-05', startDate: '2026-05-05', endDate: '2026-11-30',
    limitAmount: '25000000', ratePercent: '22',
    ops: [
      ['2026-05-06', 'D', '25000000'],
      ['2026-10-20', 'R', '25000000', 'Rejalashtirilgan qaytarish'],
    ],
  },
];

await api('POST', '/auth/login', { username: USERNAME, password: PASSWORD });

const existing = await api<{ tin: string }[]>('GET', '/companies');
if (existing.some((c) => c.tin.startsWith('9000000'))) {
  console.error('Demo data already exists (companies with TIN 9000000xx). Nothing added.');
  process.exit(1);
}

const companyIds: string[] = [];
for (const [i, [name, tin, address]] of companies.entries()) {
  const created = await api<{ id: string }>('POST', '/companies', {
    name: `"${name}" MCHJ`,
    address,
    tin,
    vatRegCode: i % 3 === 0 ? `3260${tin.slice(1)}` : undefined,
    bankAccount: `2020800090000${String(i + 1).padStart(7, '0')}`,
    mfo: ['00450', '01071', '00873', '00440'][i % 4],
  });
  companyIds.push(created.id);
}
console.log(`✓ ${companyIds.length} firma`);

const contractIds: Record<string, string> = {};
let opCount = 0;
for (const c of contracts) {
  const created = await api<{ id: string }>('POST', '/contracts', {
    number: c.number,
    signedOn: c.signedOn,
    lenderId: companyIds[c.lender],
    borrowerId: companyIds[c.borrower],
    limitAmount: c.limitAmount,
    startDate: c.startDate,
    endDate: c.endDate,
    ratePercent: c.ratePercent,
  });
  contractIds[c.number] = created.id;
  for (const [changedOn, ratePercent] of c.rates ?? []) {
    await api('POST', `/contracts/${created.id}/rates`, { ratePercent, changedOn, confirmWarnings: true });
  }
  for (const [date, type, amount, note] of c.ops) {
    await api('POST', `/contracts/${created.id}/operations`, { date, type: TYPES[type], amount, note, confirmWarnings: true });
    opCount++;
  }
}
console.log(`✓ ${contracts.length} shartnoma, ${opCount} operatsiya`);

// September invoices: two drafted, one drafted and then recalculated (shows the "amount changed" warning).
const draft = (number: string, didoxDocumentId?: string) =>
  api('PUT', `/invoices/2026-09/${contractIds[number]}/draft`, didoxDocumentId ? { didoxDocumentId } : {});
await draft('12/25', 'DX-2026-0915');
await draft('07-MY');
await draft('45', 'DX-2026-0921');
await api('POST', `/contracts/${contractIds['45']}/operations`, {
  date: '2026-09-20',
  type: 'PRINCIPAL_REPAYMENT',
  amount: '10000000',
  note: 'Kech kiritildi — qoralamadan keyin',
  confirmWarnings: true,
});
console.log('✓ sentabr: 3 ta qoralama belgisi (bittasining summasi keyin o\'zgargan)');
