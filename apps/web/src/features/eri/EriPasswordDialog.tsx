import { LoaderCircle } from 'lucide-react'
import { useState } from 'react'
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
import type { EriPasswordStatus } from '@/lib/desktop'
import { useRemoveEriPassword, useSetEriPassword } from './api'

interface Props {
  company: { name: string; tin: string }
  status: EriPasswordStatus | undefined
  onOpenChange: (open: boolean) => void
}

/** FR-8.2: the accountant enters the firm's ERI password once; the app types it into E-IMZO at Didox login. */
export function EriPasswordDialog({ company, status, onOpenChange }: Props) {
  const save = useSetEriPassword()
  const remove = useRemoveEriPassword()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const pending = save.isPending || remove.isPending
  const fieldId = 'eri-password'

  const run = async (action: () => Promise<unknown>, done: string) => {
    setError(null)
    try {
      await action()
      setPassword('')
      toast.success(done)
      onOpenChange(false)
    } catch (e) {
      setPassword('')
      setError(e instanceof Error && e.message ? e.message : "Parolni saqlab bo'lmadi")
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
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!password) return setError('Parolni kiriting')
            void run(() => save.mutateAsync({ tin: company.tin, password }), 'ERI paroli saqlandi')
          }}
        >
          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <FormField id={fieldId} label="ERI kaliti paroli">
            <Input
              id={fieldId}
              type="password"
              autoComplete="off"
              maxLength={256}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </FormField>
          <p className="text-muted-foreground text-sm">
            Parol faqat shu kompyuterda, operatsion tizim shifri bilan saqlanadi va qayta ko'rsatilmaydi. Ilova
            hujjatlarni imzolamaydi.
          </p>
          <DialogFooter className="gap-2">
            {status && status !== 'missing' && (
              <Button
                type="button"
                variant="outline"
                className="h-9 sm:mr-auto"
                disabled={pending}
                onClick={() => void run(() => remove.mutateAsync(company.tin), "ERI paroli o'chirildi")}
              >
                Parolni o'chirish
              </Button>
            )}
            <DialogClose asChild>
              <Button type="button" variant="outline" className="h-9">
                Bekor qilish
              </Button>
            </DialogClose>
            <Button type="submit" className="h-9" disabled={pending}>
              {save.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              Saqlash
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
