import { zodResolver } from '@hookform/resolvers/zod'
import { LoaderCircle } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { FormField } from '@/components/FormField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/lib/api'
import { describedBy } from '@/lib/form'
import { cn } from '@/lib/utils'
import { type Company, useSaveCompany } from './api'
import { companyFields, type CompanyFormValues, companySchema } from './schema'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present → edit mode. */
  company?: Company
}

const LATER = "Ixtiyoriy — Didox fakturasidan import qilinsa o'zi to'ladi"
const empty: CompanyFormValues = { name: '', address: '', tin: '', vatRegCode: '', bankAccount: '', mfo: '' }

type FieldConfig = {
  name: keyof CompanyFormValues
  label: string
  required?: boolean
  digits?: number
  hint?: string
  wide?: boolean
}

const fieldConfig: FieldConfig[] = [
  { name: 'name', label: 'Nomi', required: true, wide: true, hint: 'Masalan: "ALFA SAVDO" MCHJ' },
  { name: 'address', label: 'Manzil', wide: true, hint: LATER },
  { name: 'tin', label: 'STIR', required: true, digits: 9 },
  { name: 'vatRegCode', label: 'QQS registratsiya kodi', digits: 12, hint: 'Ixtiyoriy' },
  { name: 'bankAccount', label: 'Hisob raqami', digits: 20, hint: LATER },
  { name: 'mfo', label: 'MFO', digits: 5, hint: LATER },
]

export function CompanyFormDialog({ open, onOpenChange, company }: Props) {
  const save = useSaveCompany(company?.id)
  const { register, handleSubmit, setError, formState } = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema),
    defaultValues: company
      ? {
          ...company,
          address: company.address ?? '',
          vatRegCode: company.vatRegCode ?? '',
          bankAccount: company.bankAccount ?? '',
          mfo: company.mfo ?? '',
        }
      : empty,
  })
  const { errors } = formState

  const onSubmit = handleSubmit(async (values) => {
    try {
      await save.mutateAsync({
        ...values,
        address: values.address || null,
        vatRegCode: values.vatRegCode || null,
        bankAccount: values.bankAccount || null,
        mfo: values.mfo || null,
      })
      toast.success(company ? 'Firma yangilandi' : "Firma qo'shildi")
      onOpenChange(false)
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      // Expired session: the query client's global handler redirects to /login.
      if (error.status === 401) return
      if (error.status === 409) {
        setError('tin', { message: error.message }, { shouldFocus: true })
        return
      }
      const known = companyFields.filter((field) => error.fieldErrors[field])
      known.forEach((field, i) => setError(field, { message: error.fieldErrors[field] }, { shouldFocus: i === 0 }))
      if (!known.length) setError('root', { message: error.message })
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{company ? 'Firmani tahrirlash' : 'Yangi firma'}</DialogTitle>
          <DialogDescription>Rekvizitlar schyot-fakturada ishlatiladi.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          {errors.root && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{errors.root.message}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {fieldConfig.map(({ name, label, required, digits, hint, wide }) => {
              const id = `company-${name}`
              const error = errors[name]?.message
              return (
                <div key={name} className={cn(wide && 'sm:col-span-2')}>
                  <FormField id={id} label={label} required={required} hint={hint} error={error}>
                    <Input
                      id={id}
                      autoComplete="off"
                      className={cn(digits && 'font-mono tabular-nums')}
                      inputMode={digits ? 'numeric' : undefined}
                      maxLength={digits}
                      aria-required={required}
                      aria-invalid={!!error}
                      aria-describedby={describedBy(id, error, hint)}
                      {...register(name)}
                    />
                  </FormField>
                </div>
              )
            })}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="h-9">
                Bekor qilish
              </Button>
            </DialogClose>
            <Button type="submit" className="h-9" disabled={save.isPending}>
              {save.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              Saqlash
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
