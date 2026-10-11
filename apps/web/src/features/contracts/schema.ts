import { z } from 'zod'
import { dateError } from '@/lib/dates'
import { parseMoneyInput, parseRateInput, rateInRange } from '@/lib/format'

// Mirrors apps/api/src/contracts/dto/contract.dto.ts and ContractsService.assertTerms.
const required = (message: string) => z.string().trim().min(1, message)

const base = {
  number: required('Shartnoma raqami kiritilmagan').max(50),
  signedOn: required('Sana kiritilmagan'),
  lenderId: required('Firma tanlanmagan'),
  borrowerId: required('Firma tanlanmagan'),
  limitAmount: required('Summa kiritilmagan'),
  startDate: required('Sana kiritilmagan'),
  endDate: required('Sana kiritilmagan'),
}

type Values = { [K in keyof typeof base]: string } & { ratePercent?: string }

function rules(values: Values, ctx: z.RefinementCtx) {
  const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message })
  if (values.lenderId && values.lenderId === values.borrowerId) {
    issue('borrowerId', "Beruvchi va oluvchi bir xil firma bo'lishi mumkin emas")
  }
  for (const field of ['signedOn', 'startDate', 'endDate'] as const) {
    const error = values[field] && dateError(values[field])
    if (error) issue(field, error)
  }
  if (values.startDate && values.endDate && values.endDate <= values.startDate) {
    issue('endDate', "Tugash sanasi boshlanish sanasidan keyin bo'lishi kerak")
  }
  if (values.limitAmount) {
    const amount = parseMoneyInput(values.limitAmount)
    if (amount === null) issue('limitAmount', "Summa noto'g'ri: masalan 10 000 000 000")
    else if (/^[0.]+$/.test(amount)) issue('limitAmount', "Summa 0 dan katta bo'lishi kerak")
  }
  if (values.ratePercent !== undefined && values.ratePercent.trim()) {
    const rate = parseRateInput(values.ratePercent)
    if (rate === null) issue('ratePercent', "Stavka noto'g'ri: masalan 14 yoki 14,5")
    else if (!rateInRange(rate)) issue('ratePercent', 'Stavka 0 dan katta va 100 dan oshmasligi kerak')
  }
}

export const createContractSchema = z
  .object({ ...base, ratePercent: required('Stavka kiritilmagan') })
  .superRefine(rules)

/** FR-2.5: the rate is not editable here (Module 5) — the field stays empty and unchecked. */
export const editContractSchema = z.object({ ...base, ratePercent: z.string() }).superRefine(rules)

export type ContractFormValues = z.input<typeof createContractSchema>
