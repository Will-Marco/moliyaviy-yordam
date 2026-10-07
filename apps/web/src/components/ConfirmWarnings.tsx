import { LoaderCircle, TriangleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import type { Warning } from '@/lib/warnings'

interface Props {
  warnings: Warning[]
  pending: boolean
  onBack: () => void
  onConfirm: () => void
}

/** Non-blocking warnings inside a dialog: go back and change, or save anyway. */
export function ConfirmWarnings({ warnings, pending, onBack, onConfirm }: Props) {
  return (
    <>
      <Alert className="border-amber-300 bg-amber-50 text-amber-950">
        <TriangleAlert className="text-amber-700" />
        <AlertTitle>Diqqat</AlertTitle>
        <AlertDescription className="text-amber-950">
          <ul className="list-inside list-disc">
            {warnings.map((w) => (
              <li key={w.code + w.message}>{w.message}</li>
            ))}
          </ul>
        </AlertDescription>
      </Alert>
      <DialogFooter>
        <Button variant="outline" className="h-9" onClick={onBack} disabled={pending}>
          O'zgartirish
        </Button>
        <Button className="h-9" disabled={pending} onClick={onConfirm}>
          {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          Baribir saqlash
        </Button>
      </DialogFooter>
    </>
  )
}
