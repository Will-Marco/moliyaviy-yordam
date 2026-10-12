import { LoaderCircle, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { isUnauthorized } from '@/lib/api'
import { type Warning, warningsToConfirm } from '@/lib/warnings'

interface Props {
  title: string
  /** What is being deleted; null keeps the dialog closed. */
  description: string | null
  successMessage: string
  /** Sends the delete; `confirmWarnings` is true once the accountant has seen the server's warnings. */
  onDelete: (confirmWarnings: boolean) => Promise<unknown>
  onClose: () => void
}

/**
 * Confirm-then-delete for records whose removal the server checks (FR-3.2, FR-5.3): a 409 with warnings keeps the
 * dialog open, lists them and turns the button into "Baribir o'chirish" — the same rule as saving (FR-3.3).
 */
export function DeleteWithWarningsDialog({ title, description, successMessage, onDelete, onClose }: Props) {
  const [warnings, setWarnings] = useState<Warning[] | null>(null)
  const [pending, setPending] = useState(false)
  const close = () => {
    setWarnings(null)
    onClose()
  }
  const run = async () => {
    setPending(true)
    try {
      await onDelete(!!warnings)
      toast.success(successMessage)
      close()
    } catch (error) {
      const toConfirm = warningsToConfirm(error)
      if (toConfirm) return setWarnings(toConfirm)
      if (!isUnauthorized(error)) toast.error(error instanceof Error ? error.message : "O'chirib bo'lmadi")
      close()
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialog open={description !== null} onOpenChange={(open) => !open && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {warnings && (
          <Alert className="border-amber-300 bg-amber-50 text-amber-900">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>Diqqat</AlertTitle>
            <AlertDescription className="text-amber-900">
              <ul className="list-disc pl-4">
                {warnings.map((w) => (
                  <li key={w.code + w.message}>{w.message}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={(event) => {
              event.preventDefault() // stay open: the server may answer with warnings to confirm
              void run()
            }}
          >
            {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {warnings ? "Baribir o'chirish" : "O'chirish"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
