import { Check, LoaderCircle, LogIn, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { type DidoxProgress, useDesktop } from '@/lib/desktop'
import { useCheckDidoxLogin } from './api'

/** Step ids the desktop app reports (run.ts + steps/login.ts); unknown ids are shown as they come. */
const STEP_LABELS: Record<string, string> = {
  eimzo: 'E-IMZO kaliti',
  password: 'ERI paroli',
  preflight: 'Klaviatura va ruxsatlar',
  window: 'Didox oynasi',
  openLogin: 'Kirish sahifasi',
  pickKey: 'Kalitni tanlash',
  armAndEnter: 'Parolni E-IMZO oynasiga yozish',
  awaitLogin: "Didox'ga kirish",
  verifyFirm: "Firmani STIR bo'yicha tekshirish",
  logout: "Didox'dan chiqish",
}

/** After these the saved password is marked rejected and the app will not try it again (desktop REJECTING_CODES). */
const REJECTING = new Set(['WRONG_PASSWORD', 'LOGIN_FAILED', 'AUTOTYPE_INTERRUPTED'])

/** What the accountant can do about a failure the app cannot fix itself. */
const HINTS: Record<string, string> = {
  KEYBOARD_LAYOUT: "Klaviatura tartibini ABC yoki US ga o'tkazib, qayta tekshiring.",
  ACCESSIBILITY_DENIED:
    "System Settings → Privacy & Security → Accessibility bo'limida «Moliyaviy yordam»ga ruxsat bering va qayta tekshiring.",
  EIMZO_DIALOG_OPEN: "Ochiq turgan E-IMZO oynasini yoping, so'ng qayta tekshiring.",
  PLATFORM_UNSUPPORTED: "Bu imkoniyat faqat macOS va Windows'da ishlaydi.",
  EIMZO_NOT_RUNNING: "E-IMZO dasturini ishga tushiring va qayta tekshiring.",
  TIMEOUT: "Didox javobi kechikdi — birozdan keyin qayta urinib ko'ring.",
  RUN_IN_PROGRESS: 'Boshqa tekshiruv tugashini kuting.',
}

interface Props {
  company: { name: string; tin: string }
  onOpenChange: (open: boolean) => void
}

/** "Kirishni tekshirish" (M8b): confirm → live steps → result. Cannot be dismissed while Didox is being driven. */
export function CheckLoginDialog({ company, onOpenChange }: Props) {
  const desktop = useDesktop()
  const check = useCheckDidoxLogin()
  const [steps, setSteps] = useState<DidoxProgress[]>([])
  const [cancelling, setCancelling] = useState(false)
  const running = check.isPending

  useEffect(
    () =>
      desktop?.didox?.onProgress((p) => {
        if (p.firmTin !== company.tin || p.step === 'result') return
        setSteps((prev) => {
          const at = prev.findIndex((s) => s.step === p.step)
          return at === -1 ? [...prev, p] : prev.map((s, i) => (i === at ? p : s))
        })
      }),
    [desktop, company.tin],
  )

  const start = () => {
    setSteps([])
    setCancelling(false)
    check.mutate(company.tin)
  }

  const cancel = () => {
    setCancelling(true)
    void desktop?.didox?.cancel()
  }

  const result = check.data
  const failure = result && !result.ok ? result : null

  return (
    <Dialog open onOpenChange={(open) => !running && onOpenChange(open)}>
      <DialogContent className="sm:max-w-md" showCloseButton={!running}>
        <DialogHeader>
          <DialogTitle>Didox'ga kirishni tekshirish</DialogTitle>
          <DialogDescription>{`${company.name} (STIR ${company.tin})`}</DialogDescription>
        </DialogHeader>

        {check.isIdle && (
          <p className="text-sm">
            Ilova Didox oynasini ochadi, firma kalitini tanlaydi, saqlangan parolni E-IMZO oynasiga bir marta yozadi,
            kirilgan firmani STIR bo'yicha tekshiradi va chiqadi. Hech narsa imzolanmaydi va yuborilmaydi. Jarayon
            davomida klaviatura va sichqonchaga tegmang.
          </p>
        )}

        {steps.length > 0 && (
          <ol className="grid gap-1.5 text-sm" aria-label="Qadamlar">
            {steps.map((s) => (
              <li key={s.step} className="flex items-start gap-2">
                {s.status === 'running' ? (
                  <LoaderCircle className="mt-0.5 size-4 animate-spin" aria-label="bajarilmoqda" />
                ) : s.status === 'done' ? (
                  <Check className="mt-0.5 size-4 text-emerald-600" aria-label="bajarildi" />
                ) : (
                  <X className="text-destructive mt-0.5 size-4" aria-label="xato" />
                )}
                <span>
                  {STEP_LABELS[s.step] ?? s.step}
                  {s.message && s.status === 'failed' && <span className="text-muted-foreground">{` — ${s.message}`}</span>}
                </span>
              </li>
            ))}
          </ol>
        )}

        {running && steps.length === 0 && (
          <p className="text-muted-foreground flex items-center gap-2 text-sm" aria-busy="true">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Boshlanmoqda…
          </p>
        )}

        {result?.ok && (
          <Alert className="border-emerald-300 bg-emerald-50 text-emerald-900" role="status">
            <AlertDescription className="text-emerald-900">
              Kirish ishladi: Didox'ga shu firma nomidan kirildi va chiqildi.
            </AlertDescription>
          </Alert>
        )}

        {failure && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>
              <p>{failure.code === 'CANCELLED' ? 'Bekor qilindi' : failure.message}</p>
              {HINTS[failure.code] && <p>{HINTS[failure.code]}</p>}
              {REJECTING.has(failure.code) && (
                <p>Parol "rad etilgan" deb belgilandi: ilova u bilan qayta urinmaydi — parolni tekshirib, qayta kiriting.</p>
              )}
              {failure.screenshot && <p className="text-xs break-all">{`Diagnostika rasmi: ${failure.screenshot}`}</p>}
            </AlertDescription>
          </Alert>
        )}

        {check.error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>
              {`Tekshirishni boshlab bo'lmadi: ${check.error instanceof Error ? check.error.message : String(check.error)}`}
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2">
          {running ? (
            <Button type="button" variant="outline" className="h-9" disabled={cancelling} onClick={cancel}>
              {cancelling && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              Bekor qilish
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" className="h-9" onClick={() => onOpenChange(false)}>
                Yopish
              </Button>
              {check.isIdle && (
                <Button type="button" className="h-9" onClick={start}>
                  <LogIn aria-hidden="true" />
                  Boshlash
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
