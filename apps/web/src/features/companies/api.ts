import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export interface Company {
  id: string
  name: string
  /** Address, bank account and MFO may be filled in later (FR-1.2). */
  address: string | null
  tin: string
  vatRegCode: string | null
  bankAccount: string | null
  mfo: string | null
}

export type CompanyInput = Omit<Company, 'id'>

/** Requisites an invoice needs but that may still be missing. */
export const missingRequisites = (c: Company) => !c.address || !c.bankAccount || !c.mfo

const companiesKey = ['companies'] as const

export function useCompanies() {
  return useQuery({ queryKey: companiesKey, queryFn: () => apiFetch<Company[]>('/companies') })
}

export function useSaveCompany(id?: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: CompanyInput) =>
      id
        ? apiFetch<Company>(`/companies/${id}`, { method: 'PATCH', body })
        : apiFetch<Company>('/companies', { method: 'POST', body }),
    onSuccess: () => client.invalidateQueries({ queryKey: companiesKey }),
  })
}

// FR-1.3 — import from Didox invoice exports (.xls files that are HTML inside).
export interface ImportFile {
  name: string
  content: string
}

export type ImportStatus = 'create' | 'update' | 'unchanged' | 'error'

export interface ImportItem extends CompanyInput {
  status: ImportStatus
  changes: (keyof CompanyInput)[]
  errors: Record<string, string[]>
  source: { file: string; invoiceNo: string | null; invoiceDate: string | null }
}

export interface ImportPreview {
  items: ImportItem[]
  fileErrors: { file: string; message: string }[]
}

export interface ImportResult extends ImportPreview {
  created: number
  updated: number
  unchanged: number
  skipped: number
}

export function usePreviewImport() {
  return useMutation({
    mutationFn: (files: ImportFile[]) =>
      apiFetch<ImportPreview>('/companies/import/preview', { method: 'POST', body: { files } }),
  })
}

export function useApplyImport() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (files: ImportFile[]) =>
      apiFetch<ImportResult>('/companies/import', { method: 'POST', body: { files } }),
    onSuccess: () => client.invalidateQueries({ queryKey: companiesKey }),
  })
}
