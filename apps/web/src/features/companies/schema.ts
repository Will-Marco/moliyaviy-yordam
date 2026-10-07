import { z } from 'zod'

// Mirrors apps/api/src/companies/dto/company.dto.ts — server stays the source of truth.
const digitsMessage = (n: number, label: string) => `${label} ${n} ta raqamdan iborat bo'lishi kerak`
const digits = (n: number, label: string) =>
  z.string().trim().regex(new RegExp(`^\\d{${n}}$`), digitsMessage(n, label))

export const companySchema = z.object({
  name: z.string().trim().min(1, 'Nomi kiritilmagan').max(300),
  address: z.string().trim().min(1, 'Manzil kiritilmagan').max(500),
  tin: digits(9, 'STIR'),
  vatRegCode: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{12}$/.test(v), digitsMessage(12, 'QQS registratsiya kodi')),
  bankAccount: digits(20, 'Hisob raqami'),
  mfo: digits(5, 'MFO'),
})

export type CompanyFormValues = z.input<typeof companySchema>
export const companyFields = Object.keys(companySchema.shape) as (keyof CompanyFormValues)[]
