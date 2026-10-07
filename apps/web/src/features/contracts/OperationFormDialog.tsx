import { zodResolver } from '@hookform/resolvers/zod'
import { LoaderCircle, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { FormField } from '@/components/FormField'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/lib/api'
import { formatMoney, formatMoneyInput, parseMoneyInput } from '@/lib/format'
import { describedBy } from '@/lib/form'
import { cn } from '@/lib/utils'
import type { Contract } from './api'
import {
  type Operation,
  type OperationInput,
  OPERATION_TYPES,
  type OperationType,
  useSaveOperation,
  type Warning,
  warningsToConfirm,
} from './operations-api'

// Mirrors apps/api/src/operations/dto/operation.dto.ts.
const schema = z
  .object({
    date: z.string().min(1, 'Sana kiritilmagan'),
    type: z.enum(['DISBURSEMENT', 'PRINCIPAL_REPAYMENT', 'INTEREST_PAYMENT']),
    amount: z.string().trim().min(1, 'Summa kiritilmagan'),
    note: z.string().max(500, "Izoh 500 belgidan oshmasligi kerak"),
  })
  .superRefine((values, ctx) => {
    if (!values.amount) return
    const amount = parseMoneyInput(values.amount)
    const issue = (message: string) => ctx.addIssue({ code: 'custom', path: ['amount'], message })
    if (amount === null) issue("Summa noto'g'ri: masalan 60 000 000")
    else if (/^[0.]+$/.test(amount)) issue("Summa 0 dan katta bo'lishi kerak")
  })

type Values = z.input<typeof schema>

const todayIso = () => new Date().toLocaleDateString('en-CA')

interface Props {
  contract: Contract
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present → edit mode. */
  operation?: Operation
}

export function OperationFormDialog({ contract, open, onOpenChange, operation }: Props) {
  const save = useSaveOperation(contract.id, operation?.id)
  const [warnings, setWarnings] = useState<Warning[] | null>(null)
  const [pending, setPending] = useState<OperationInput | null>(null)
  const { register, control, handleSubmit, setError, setValue, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: operation
      ? { date: operation.date, type: operation.type, amount: formatMoney(operation.amount), note: operation.note ?? '' }
      : { date: todayIso(), type: 'DISBURSEMENT', amount: '', note: '' },
  })
  const { errors } = formState
  const selectedType = useWatch({ control, name: 'type' })

  const submit = async (body: OperationInput) => {
    try {
      await save.mutateAsync(body)
      toast.success(operation ? 'Operatsiya yangilandi' : 'Operatsiya saqlandi')
      onOpenChange(false)
    } catch (error) {
      const toConfirm = warningsToConfirm(error)
      if (toConfirm) {
        setPending(body)
        setWarnings(toConfirm)
        return
      }
      if (!(error instanceof ApiError)) throw error
      if (error.status === 401) return
      const known = (['date', 'type', 'amount', 'note'] as const).filter((f) => error.fieldErrors[f])
      known.forEach((f, i) => setError(f, { message: error.fieldErrors[f] }, { shouldFocus: i === 0 }))
      if (!known.length) setError('root', { message: error.message })
    }
  }

  const onSubmit = handleSubmit((values) =>
    submit({
      date: values.date,
      type: values.type as OperationType,
      amount: parseMoneyInput(values.amount)!,
      note: values.note.trim() || null,
    }),
  )

  const id = (name: keyof Values) => `operation-${name}`
  const props = (name: keyof Values) => ({
    id: id(name),
    'aria-invalid': !!errors[name],
    'aria-describedby': describedBy(id(name), errors[name]?.message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{operation ? 'Operatsiyani tahrirlash' : 'Yangi operatsiya'}</DialogTitle>
          <DialogDescription>
            {`Shartnoma № ${contract.number}: ${contract.lender.name} → ${contract.borrower.name}`}
          </DialogDescription>
        </DialogHeader>

        {warnings ? (
          <>
            <Alert className="border-amber-300 bg-amber-50 text-amber-950">
              <TriangleAlert className="text-amber-700" />
              <AlertTitle>Diqqat</AlertTitle>
              <AlertDescription className="text-amber-950">
                <ul className="list-inside list-disc">
                  {warnings.map((w) => (
                    <li key={w.code}>{w.message}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
            <DialogFooter>
              <Button variant="outline" className="h-9" onClick={() => setWarnings(null)} disabled={save.isPending}>
                O'zgartirish
              </Button>
              <Button
                className="h-9"
                disabled={save.isPending}
                onClick={() => pending && submit({ ...pending, confirmWarnings: true })}
              >
                {save.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                Baribir saqlash
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={onSubmit} noValidate className="grid gap-4">
            {errors.root && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{errors.root.message}</AlertDescription>
              </Alert>
            )}
            <fieldset className="grid gap-1.5">
              <legend className="mb-1.5 text-sm font-medium">Turi</legend>
              <div className="grid grid-cols-3 gap-2">
                {OPERATION_TYPES.map((t) => (
                  <label
                    key={t.value}
                    title={t.long}
                    className={cn(
                      'has-focus-visible:ring-ring/50 flex h-9 cursor-pointer items-center justify-center rounded-lg border text-sm font-medium has-focus-visible:ring-3',
                      selectedType === t.value ? 'border-primary bg-accent text-accent-foreground' : 'hover:bg-secondary',
                    )}
                  >
                    <input type="radio" value={t.value} className="sr-only" {...register('type')} />
                    {t.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id={id('date')} label="Sana" required error={errors.date?.message}>
                <Input type="date" {...props('date')} {...register('date')} />
              </FormField>
              <FormField id={id('amount')} label="Summa, so'm" required error={errors.amount?.message}>
                <Input
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="60 000 000"
                  className="font-mono tabular-nums"
                  {...props('amount')}
                  {...register('amount', {
                    onBlur: (event) => {
                      const formatted = formatMoneyInput(event.target.value)
                      if (formatted) setValue('amount', formatted)
                    },
                  })}
                />
              </FormField>
            </div>
            <FormField id={id('note')} label="Izoh" error={errors.note?.message}>
              <Textarea rows={2} {...props('note')} {...register('note')} />
            </FormField>
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
        )}
      </DialogContent>
    </Dialog>
  )
}
