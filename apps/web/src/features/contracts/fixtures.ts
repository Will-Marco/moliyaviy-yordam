import type { Company } from '@/features/companies/api'
import type { Contract } from './api'

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
  rates: [{ ratePercent: '14', changedOn: '2026-01-01', effectiveFrom: '2026-01-01' }],
}
