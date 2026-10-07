import { zodResolver } from '@hookform/resolvers/zod'
import { LoaderCircle } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
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
import { useCompanies } from '@/features/companies/api'
import { ApiError } from '@/lib/api'
import { formatMoney, formatMoneyInput, formatRate, parseMoneyInput, parseRateInput } from '@/lib/format'
import { describedBy } from '@/lib/form'
import { type Contract, type ContractInput, useSaveContract } from './api'
import { CompanyPicker } from './CompanyPicker'
import { type ContractFormValues, createContractSchema, editContractSchema } from './schema'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present → edit mode (FR-2.5). */
  contract?: Contract
}

const FIELDS = ['number', 'signedOn', 'lenderId', 'borrowerId', 'limitAmount', 'startDate', 'endDate', 'ratePercent'] as const

const empty: ContractFormValues = {
  number: '',
  signedOn: '',
  lenderId: '',
  borrowerId: '',
  limitAmount: '',
  startDate: '',
  endDate: '',
  ratePercent: '',
}

function initialValues(contract?: Contract): ContractFormValues {
  if (!contract) return empty
  return {
    number: contract.number,
    signedOn: contract.signedOn,
    lenderId: contract.lender.id,
    borrowerId: contract.borrower.id,
    limitAmount: formatMoney(contract.limitAmount),
    startDate: contract.startDate,
    endDate: contract.endDate,
    ratePercent: '',
  }
}

export function ContractFormDialog({ open, onOpenChange, contract }: Props) {
  const companies = useCompanies()
  const save = useSaveContract(contract?.id)
  const { register, control, handleSubmit, setError, setValue, formState } = useForm<ContractFormValues>({
    resolver: zodResolver(contract ? editContractSchema : createContractSchema),
    defaultValues: initialValues(contract),
  })
  const { errors } = formState

  const onSubmit = handleSubmit(async (values) => {
    const body: ContractInput = {
      number: values.number.trim(),
      signedOn: values.signedOn,
      lenderId: values.lenderId,
      borrowerId: values.borrowerId,
      // The schema has already proven both parse.
      limitAmount: parseMoneyInput(values.limitAmount)!,
      startDate: values.startDate,
      endDate: values.endDate,
      ...(!contract && { ratePercent: parseRateInput(values.ratePercent)! }),
    }
    try {
      await save.mutateAsync(body)
      toast.success(contract ? 'Shartnoma yangilandi' : 'Shartnoma ochildi')
      onOpenChange(false)
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      if (error.status === 401) return
      const known = FIELDS.filter((field) => error.fieldErrors[field])
      known.forEach((field, i) => setError(field, { message: error.fieldErrors[field] }, { shouldFocus: i === 0 }))
      if (!known.length) setError('root', { message: error.message })
    }
  })

  const field = (name: (typeof FIELDS)[number]) => {
    const id = `contract-${name}`
    const error = errors[name]?.message
    return { id, error, inputProps: { id, 'aria-invalid': !!error, 'aria-describedby': describedBy(id, error) } }
  }

  const party = (name: 'lenderId' | 'borrowerId', label: string) => {
    const { id, error } = field(name)
    return (
      <FormField id={id} label={label} required error={error}>
        <Controller
          control={control}
          name={name}
          render={({ field: { value, onChange } }) => (
            <CompanyPicker
              id={id}
              value={value}
              onChange={onChange}
              companies={companies.data ?? []}
              invalid={!!error}
              describedBy={describedBy(id, error)}
            />
          )}
        />
      </FormField>
    )
  }

  const number = field('number')
  const signedOn = field('signedOn')
  const limit = field('limitAmount')
  const start = field('startDate')
  const end = field('endDate')
  const rate = field('ratePercent')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{contract ? 'Shartnomani tahrirlash' : 'Yangi shartnoma'}</DialogTitle>
          <DialogDescription>Moliyaviy yordam shartnomasi shartlari.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          {errors.root && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{errors.root.message}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id={number.id} label="Shartnoma raqami" required error={number.error}>
              <Input autoComplete="off" {...number.inputProps} {...register('number')} />
            </FormField>
            <FormField id={signedOn.id} label="Shartnoma sanasi" required error={signedOn.error}>
              <Input type="date" {...signedOn.inputProps} {...register('signedOn')} />
            </FormField>
            {party('lenderId', 'Beruvchi')}
            {party('borrowerId', 'Oluvchi')}
            <div className="sm:col-span-2">
              <FormField id={limit.id} label="Summa (limit), so'm" required error={limit.error}>
                <Input
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="10 000 000 000"
                  className="font-mono tabular-nums"
                  {...limit.inputProps}
                  {...register('limitAmount', {
                    onBlur: (event) => {
                      const formatted = formatMoneyInput(event.target.value)
                      if (formatted) setValue('limitAmount', formatted)
                    },
                  })}
                />
              </FormField>
            </div>
            <FormField id={start.id} label="Boshlanish sanasi" required error={start.error}>
              <Input type="date" {...start.inputProps} {...register('startDate')} />
            </FormField>
            <FormField id={end.id} label="Tugash sanasi" required error={end.error}>
              <Input type="date" {...end.inputProps} {...register('endDate')} />
            </FormField>
            {contract ? (
              <p className="text-muted-foreground text-sm sm:col-span-2">
                Joriy stavka: <span className="text-foreground font-medium">{formatRate(contract.currentRate.ratePercent)}</span>.
                Stavka bu yerda o'zgartirilmaydi — u stavkalar tarixi orqali o'zgaradi.
              </p>
            ) : (
              <FormField id={rate.id} label="Yillik stavka, %" required error={rate.error}>
                <Input inputMode="decimal" autoComplete="off" placeholder="14" {...rate.inputProps} {...register('ratePercent')} />
              </FormField>
            )}
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
