import type { Company } from '@/features/companies/api'
import type { Contract } from './api'
import type { Operation } from './operations-api'

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
  totals: { disbursed: '60000000.00', repaid: '15000000.00', interestPaid: '0.00', principalBalance: '45000000.00' },
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
  },
  {
    id: '0192f000-0000-7000-8000-0000000000e2',
    date: '2026-01-20',
    type: 'PRINCIPAL_REPAYMENT',
    amount: '15000000.00',
    note: 'Asosiy qarzdan',
    balanceAfter: '45000000.00',
  },
]
