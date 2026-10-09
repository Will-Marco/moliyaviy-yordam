import { z } from 'zod'

// Mirrors apps/api/src/companies/dto/company.dto.ts — server stays the source of truth.
const digitsMessage = (n: number, label: string) => `${label} ${n} ta raqamdan iborat bo'lishi kerak`
const digits = (n: number, label: string) =>
  z.string().trim().regex(new RegExp(`^\\d{${n}}$`), digitsMessage(n, label))
/** Requisites may be filled in later (e.g. by the Didox import); empty → null on submit. */
const optionalDigits = (n: number, label: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || new RegExp(`^\\d{${n}}$`).test(v), digitsMessage(n, label))

export const companySchema = z.object({
  name: z.string().trim().min(1, 'Nomi kiritilmagan').max(300),
  address: z.string().trim().max(500),
  tin: digits(9, 'STIR'),
  vatRegCode: optionalDigits(12, 'QQS registratsiya kodi'),
  bankAccount: optionalDigits(20, 'Hisob raqami'),
  mfo: optionalDigits(5, 'MFO'),
})

export type CompanyFormValues = z.input<typeof companySchema>
export const companyFields = Object.keys(companySchema.shape) as (keyof CompanyFormValues)[]
