import { LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { ConfirmWarnings } from '@/components/ConfirmWarnings'
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
import { formatDate, parseRateInput, rateInRange } from '@/lib/format'
import { describedBy } from '@/lib/form'
import { isIsoDate, todayIso } from '@/lib/dates'
import { type Warning, warningsToConfirm } from '@/lib/warnings'
import { type Contract, type Rate, type RateInput, useSaveRate } from './api'
import { effectiveFromOf } from './rates'

interface Props {
  contract: Contract
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The initial rate → correct its value only (FR-5.4); otherwise add a change (FR-5.1). */
  initial?: Rate
}

interface Values {
  ratePercent: string
  changedOn: string
}

export function RateDialog({ contract, open, onOpenChange, initial }: Props) {
  const save = useSaveRate(contract.id, initial?.id)
  const [warnings, setWarnings] = useState<Warning[] | null>(null)
  const [pending, setPending] = useState<RateInput | null>(null)
  const { register, control, handleSubmit, setError, formState } = useForm<Values>({
    defaultValues: { ratePercent: initial ? initial.ratePercent.replace('.', ',') : '', changedOn: todayIso() },
  })
  const { errors } = formState
  const changedOn = useWatch({ control, name: 'changedOn' })
  const preview = isIsoDate(changedOn) ? effectiveFromOf(changedOn) : null

  const submit = async (body: RateInput) => {
    try {
      await save.mutateAsync(body)
      toast.success(initial ? "Boshlang'ich stavka tuzatildi" : "Stavka o'zgarishi saqlandi")
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
      const known = (['ratePercent', 'changedOn'] as const).filter((f) => error.fieldErrors[f])
      known.forEach((f, i) => setError(f, { message: error.fieldErrors[f] }, { shouldFocus: i === 0 }))
      if (!known.length) setError('root', { message: error.message })
    }
  }

  const onSubmit = handleSubmit((values) => {
    // Client checks mirror the API's (contract.dto / rate.dto).
    const rate = parseRateInput(values.ratePercent)
    if (rate === null) return setError('ratePercent', { message: "Stavka noto'g'ri: masalan 14 yoki 14,5" }, { shouldFocus: true })
    if (!rateInRange(rate)) {
      return setError('ratePercent', { message: 'Stavka 0 dan katta va 100 dan oshmasligi kerak' }, { shouldFocus: true })
    }
    if (initial) return submit({ ratePercent: rate })
    if (!isIsoDate(values.changedOn)) return setError('changedOn', { message: "Sana noto'g'ri" }, { shouldFocus: true })
    return submit({ ratePercent: rate, changedOn: values.changedOn })
  })

  const rateId = 'rate-percent'
  const dateId = 'rate-changed-on'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Boshlang'ich stavkani tuzatish" : "Stavkani o'zgartirish"}</DialogTitle>
          <DialogDescription>
            {initial
              ? `Faqat qiymat o'zgaradi; ${formatDate(initial.effectiveFrom)} dan butun hisob qayta hisoblanadi.`
              : "1-sanada kiritilsa shu kundan, aks holda keyingi oyning 1-sanasidan amal qiladi."}
          </DialogDescription>
        </DialogHeader>

        {warnings ? (
          <ConfirmWarnings
            warnings={warnings}
            pending={save.isPending}
            onBack={() => setWarnings(null)}
            onConfirm={() => pending && submit({ ...pending, confirmWarnings: true })}
          />
        ) : (
          <form onSubmit={onSubmit} noValidate className="grid gap-4">
            {errors.root && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{errors.root.message}</AlertDescription>
              </Alert>
            )}
            <FormField
              id={rateId}
              label={initial ? "Boshlang'ich stavka, %" : 'Yangi stavka, %'}
              required
              error={errors.ratePercent?.message}
            >
              <Input
                id={rateId}
                inputMode="decimal"
                autoComplete="off"
                placeholder="14"
                aria-invalid={!!errors.ratePercent}
                aria-describedby={describedBy(rateId, errors.ratePercent?.message)}
                {...register('ratePercent', { required: 'Stavka kiritilmagan' })}
              />
            </FormField>
            {!initial && (
              <FormField id={dateId} label="O'zgartirish sanasi" required error={errors.changedOn?.message}>
                <Input
                  id={dateId}
                  type="date"
                  aria-invalid={!!errors.changedOn}
                  aria-describedby={describedBy(dateId, errors.changedOn?.message) ?? (preview ? `${dateId}-preview` : undefined)}
                  {...register('changedOn', { required: 'Sana kiritilmagan' })}
                />
                {preview && (
                  <p id={`${dateId}-preview`} className="text-primary text-sm font-medium" aria-live="polite">
                    {`${formatDate(preview)} dan amal qiladi`}
                  </p>
                )}
              </FormField>
            )}
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
