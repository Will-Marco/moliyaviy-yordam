import { LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
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
import type { EriPasswordStatus } from '@/lib/desktop'
import { useOpenEriPasswordWindow, useRemoveEriPassword } from './api'

interface Props {
  company: { name: string; tin: string }
  status: EriPasswordStatus | undefined
  onOpenChange: (open: boolean) => void
}

/**
 * FR-8.2: the accountant enters the firm's ERI password once; the app types it into E-IMZO at Didox login. Since M13
 * this page comes from the shared server, so the password is typed in the desktop app's own window, not here.
 */
export function EriPasswordDialog({ company, status, onOpenChange }: Props) {
  const enter = useOpenEriPasswordWindow()
  const remove = useRemoveEriPassword()
  const [error, setError] = useState<string | null>(null)
  const pending = enter.isPending || remove.isPending

  const openWindow = async () => {
    setError(null)
    try {
      const { saved } = await enter.mutateAsync(company.tin)
      if (!saved) return
      toast.success('ERI paroli saqlandi')
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Parol oynasini ochib bo'lmadi")
    }
  }

  const removePassword = async () => {
    setError(null)
    try {
      const refused = await remove.mutateAsync(company.tin)
      if (refused) {
        // Not confirmed in the desktop app's own dialog: the password stays, and so does this dialog.
        if (refused.code !== 'CANCELLED') setError(refused.message)
        return
      }
      toast.success("ERI paroli o'chirildi")
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Parolni o'chirib bo'lmadi")
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>ERI paroli</DialogTitle>
          <DialogDescription>
            {`${company.name} (STIR ${company.tin}). Ilova Didox'ga kirishda bu parolni E-IMZO oynasiga o'zi yozadi.`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <p className="text-muted-foreground text-sm">
            Parol ilovaning alohida oynasida kiritiladi: u faqat shu kompyuterda, operatsion tizim shifri bilan
            saqlanadi, serverga yuborilmaydi va qayta ko'rsatilmaydi. Ilova hujjatlarni imzolamaydi.
          </p>
          {enter.isPending && (
            <p className="text-muted-foreground flex items-center gap-2 text-sm" aria-live="polite">
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              Parol oynasi ochiq — o'sha oynada kiriting
            </p>
          )}
        </div>
        <DialogFooter className="gap-2">
          {status && status !== 'missing' && (
            <Button type="button" variant="outline" className="h-9 sm:mr-auto" disabled={pending} onClick={() => void removePassword()}>
              Parolni o'chirish
            </Button>
          )}
          <DialogClose asChild>
            <Button type="button" variant="outline" className="h-9">
              Bekor qilish
            </Button>
          </DialogClose>
          <Button type="button" className="h-9" disabled={pending} onClick={() => void openWindow()}>
            {status && status !== 'missing' ? 'Parolni yangilash' : 'Parolni kiritish'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
