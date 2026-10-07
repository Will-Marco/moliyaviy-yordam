import type { Company } from '@/features/companies/api'
import type { Contract } from './api'
import type { Operation } from './operations-api'
import type { Report } from './report-api'

export const companyA: Company = {
  id: '0192f000-0000-7000-8000-00000000000a',
  name: 'A MCHJ',
  address: 'Toshkent',
  tin: '300000001',
  vatRegCode: null,
  bankAccount: '20208000100000000001',
  mfo: '01071',
}
export const companyB: Company = { ...companyA, id: '0192f000-0000-7000-8000-00000000000b', name: 'B MCHJ', tin: '300000002' }

/** SRS etalon contract. */
export const etalon: Contract = {
  id: '0192f000-0000-7000-8000-0000000000c1',
  number: '1',
  signedOn: '2026-01-01',
  lender: { id: companyA.id, name: companyA.name, tin: companyA.tin },
  borrower: { id: companyB.id, name: companyB.name, tin: companyB.tin },
  limitAmount: '10000000000.00',
  startDate: '2026-01-01',
  endDate: '2027-07-31',
  currentRate: { ratePercent: '14', effectiveFrom: '2026-01-01' },
  totals: {
    disbursed: '60000000.00',
    repaid: '15000000.00',
    interestPaid: '0.00',
    principalBalance: '45000000.00',
    interestDebt: '1035616.44',
  },
  rates: [{ ratePercent: '14', changedOn: '2026-01-01', effectiveFrom: '2026-01-01' }],
}

export const etalonOperations: Operation[] = [
  {
    id: '0192f000-0000-7000-8000-0000000000e1',
    date: '2026-01-05',
    type: 'DISBURSEMENT',
    amount: '60000000.00',
    note: null,
    balanceAfter: '60000000.00',
    scheduled: false,
  },
  {
    id: '0192f000-0000-7000-8000-0000000000e2',
    date: '2026-01-20',
    type: 'PRINCIPAL_REPAYMENT',
    amount: '15000000.00',
    note: 'Asosiy qarzdan',
    balanceAfter: '45000000.00',
    scheduled: false,
  },
]

/** Etalon seen on 15.03.2026 (matches apps/api/test/report.e2e-spec.ts). */
export const etalonReport: Report = {
  asOf: '2026-03-15',
  months: [
    {
      month: '2026-01',
      from: '2026-01-01',
      to: '2026-01-31',
      partial: false,
      rates: ['14'],
      openingBalance: '0.00',
      disbursed: '60000000.00',
      repaid: '15000000.00',
      closingBalance: '45000000.00',
      interest: '552328.77',
      interestExact: '552328.767123',
      interestPaid: '0.00',
      interestDebt: '552328.77',
      segments: [
        { from: '2026-01-01', to: '2026-01-04', days: 4, balance: '0.00', ratePercent: '14', yearDays: 365, interestExact: '0.000000' },
        { from: '2026-01-05', to: '2026-01-19', days: 15, balance: '60000000.00', ratePercent: '14', yearDays: 365, interestExact: '345205.479452' },
        { from: '2026-01-20', to: '2026-01-31', days: 12, balance: '45000000.00', ratePercent: '14', yearDays: 365, interestExact: '207123.287671' },
      ],
    },
    {
      month: '2026-02',
      from: '2026-02-01',
      to: '2026-02-28',
      partial: false,
      rates: ['14'],
      openingBalance: '45000000.00',
      disbursed: '0.00',
      repaid: '0.00',
      closingBalance: '45000000.00',
      interest: '483287.67',
      interestExact: '483287.671233',
      interestPaid: '0.00',
      interestDebt: '1035616.44',
      segments: [
        { from: '2026-02-01', to: '2026-02-28', days: 28, balance: '45000000.00', ratePercent: '14', yearDays: 365, interestExact: '483287.671233' },
      ],
    },
    {
      month: '2026-03',
      from: '2026-03-01',
      to: '2026-03-15',
      partial: true,
      rates: ['14'],
      openingBalance: '45000000.00',
      disbursed: '0.00',
      repaid: '0.00',
      closingBalance: '45000000.00',
      interest: '258904.11',
      interestExact: '258904.109589',
      interestPaid: '0.00',
      interestDebt: '1294520.55',
      segments: [
        { from: '2026-03-01', to: '2026-03-15', days: 15, balance: '45000000.00', ratePercent: '14', yearDays: 365, interestExact: '258904.109589' },
      ],
    },
  ],
  totals: {
    interestAccrued: '1294520.55',
    interestPaid: '0.00',
    interestDebt: '1294520.55',
    interestDebtCompleted: '1035616.44',
  },
}
