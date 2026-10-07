import { LoaderCircle } from 'lucide-react'
import { useState } from 'react'
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
import { formatMonth } from '@/lib/format'
import { type Warning, warningsToConfirm } from '@/lib/warnings'
import { type Invoice, type MarkDraftInput, useMarkDraft } from './api'

interface Props {
  month: string
  invoice: Invoice
  onOpenChange: (open: boolean) => void
}

/** FR-7.4: the accountant records by hand that the draft exists in Didox. */
export function MarkDraftDialog({ month, invoice, onOpenChange }: Props) {
  const mark = useMarkDraft(month, invoice.contractId)
  const [didoxDocumentId, setDidoxDocumentId] = useState(invoice.draft?.didoxDocumentId ?? '')
  const [warnings, setWarnings] = useState<Warning[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = async (body: MarkDraftInput) => {
    setError(null)
    try {
      await mark.mutateAsync(body)
      toast.success('Qoralama yaratildi deb belgilandi')
      onOpenChange(false)
    } catch (e) {
      const toConfirm = warningsToConfirm(e)
      if (toConfirm) return setWarnings(toConfirm)
      if (!(e instanceof ApiError)) throw e
      if (e.status !== 401) setError(e.fieldErrors.didoxDocumentId ?? e.message)
    }
  }

  const input = (): MarkDraftInput => {
    const id = didoxDocumentId.trim()
    return id ? { didoxDocumentId: id } : {}
  }
  const fieldId = 'didox-document-id'

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Qoralama yaratildi</DialogTitle>
          <DialogDescription>
            {`№ ${invoice.contract.number}, ${invoice.borrower.name} — ${formatMonth(month)}. Didox'da qoralama yaratilganini belgilang.`}
          </DialogDescription>
        </DialogHeader>

        {warnings ? (
          <ConfirmWarnings
            warnings={warnings}
            pending={mark.isPending}
            onBack={() => setWarnings(null)}
            onConfirm={() => submit({ ...input(), confirmWarnings: true })}
          />
        ) : (
          <form
            noValidate
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              void submit(input())
            }}
          >
            {error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <FormField id={fieldId} label="Didox hujjat ID (ixtiyoriy)">
              <Input
                id={fieldId}
                autoComplete="off"
                maxLength={100}
                value={didoxDocumentId}
                onChange={(e) => setDidoxDocumentId(e.target.value)}
              />
            </FormField>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" className="h-9">
                  Bekor qilish
                </Button>
              </DialogClose>
              <Button type="submit" className="h-9" disabled={mark.isPending}>
                {mark.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                Saqlash
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
