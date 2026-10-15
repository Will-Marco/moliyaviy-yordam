import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, LoaderCircle, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
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
import {
  type DidoxInvoiceState,
  type DidoxProgress,
  type DidoxRun,
  type DidoxRunInvoice,
  useDesktop,
} from '@/lib/desktop'
import { formatMoney, formatMonth } from '@/lib/format'
import { invoicesKey } from './api'
import { didoxFlagsKey, didoxRunsKey } from './didoxApi'
import { RUN_LABELS, STATE_CLASS, STATE_LABELS } from './didoxLabels'

/** How often the journal is read while the run is going; events alone do not carry per-invoice state. */
const POLL_MS = 1500

/**
 * Step ids the desktop app reports during a draft run (run.ts, steps/login.ts, steps/create-draft.ts);
 * unknown ids are shown as they come, so a new desktop build never hides a step.
 */
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
  similarCheck: "O'xshash qoralamani tekshirish",
  openForm: 'Faktura formasi',
  verifyType: 'Hujjat turi',
  verifySeller: 'Sotuvchi STIR',
  fillContract: 'Shartnoma raqami va sanasi',
  fillCounterparty: 'Kontragent',
  fillItem: 'Qator (MXIK, birlik, QQS)',
  fillDescription: 'Qator nomi',
  fillQtyPrice: 'Soni va summa',
  setOrigin: 'Tovarning kelib chiqishi',
  verifyBlank: "Bo'sh maydonlarni tekshirish",
  save: 'Qoralamani saqlash',
  locateDraftId: 'Qoralama ID sini topish',
  mark: 'Ilovada belgilash',
}

/** Newest step per invoice (per firm for the login steps), in the order the steps first appeared. */
function withStep(log: DidoxProgress[], event: DidoxProgress): DidoxProgress[] {
  const at = log.findIndex((p) => p.firmTin === event.firmTin && p.contractId === event.contractId && p.step === event.step)
  if (at !== -1) return log.map((p, i) => (i === at ? event : p))
  // One line per invoice: its previous step is replaced, not stacked.
  const previous = log.findIndex((p) => p.firmTin === event.firmTin && p.contractId === event.contractId)
  return previous === -1 ? [...log, event] : log.map((p, i) => (i === previous ? event : p))
}

function logLine(event: DidoxProgress, run: DidoxRun | null): string {
  const firm = run?.firms.find((f) => f.tin === event.firmTin)
  const invoice = event.contractId ? firm?.invoices.find((i) => i.contractId === event.contractId) : undefined
  const position = event.invoiceIndex && event.invoiceCount ? `${event.invoiceIndex}/${event.invoiceCount}` : null
  const who = invoice ? `№ ${invoice.contractNumber}` : (firm?.name ?? `STIR ${event.firmTin}`)
  return [position, who, STEP_LABELS[event.step] ?? event.step].filter(Boolean).join(' · ')
}

interface Props {
  month: string
  /** How many invoices of the month still wait for a draft — shown before the run is let loose. */
  pending: number
  onOpenChange: (open: boolean) => void
}

/**
 * M8c: starts a Didox draft-creation run for the month and shows it live. Cannot be dismissed while the app is
 * driving Didox — closing it mid-run would leave the accountant without the "Bekor qilish" button.
 */
export function DidoxRunDialog({ month, pending, onOpenChange }: Props) {
  const desktop = useDesktop()
  const client = useQueryClient()
  const [log, setLog] = useState<DidoxProgress[]>([])
  const [cancelling, setCancelling] = useState(false)
  /*
   * Nothing is driven until the accountant says so (spec §7): the app is about to take over the keyboard of this
   * computer, and that is not something a stray click should start.
   */
  const [started, setStarted] = useState(false)

  const start = useMutation({
    mutationFn: () => desktop!.didox!.createDrafts({ month, lenderIds: 'all' }),
  })
  const startFailure = start.data && !start.data.ok ? start.data : null

  const status = useQuery({
    queryKey: ['didox-run', month],
    queryFn: () => desktop!.didox!.status(),
    enabled: start.data?.ok === true,
    // Polling stops only once a finished journal has been read: an unreadable status must not strand the dialog.
    refetchInterval: (query) => (query.state.data && query.state.data.status !== 'running' ? false : POLL_MS),
  })

  const run = status.data ?? null
  const finished = !!run && run.status !== 'running'
  const stopped = !!startFailure || !!start.error
  const running = started && !stopped && !finished

  // StrictMode mounts effects twice in dev; a second createDrafts would come back RUN_IN_PROGRESS.
  const asked = useRef(false)
  const { mutate } = start
  useEffect(() => {
    if (!started || asked.current) return
    asked.current = true
    mutate()
  }, [started, mutate])

  useEffect(
    () =>
      desktop?.didox?.onProgress((event) => {
        // `result` is the login check's own closing event (M8b); a run reports steps only.
        if (event.step === 'result') return
        setLog((prev) => withStep(prev, event))
      }),
    [desktop],
  )

  // The rows pick up their "Qoralama yaratildi (Didox)" badge from the API, not from the journal.
  useEffect(() => {
    if (!finished) return
    void client.invalidateQueries({ queryKey: invoicesKey })
    // The "e'tibor kerak" marks the run left: the robot puts them on the server before it reports the run over.
    void client.invalidateQueries({ queryKey: didoxFlagsKey })
    // The history card should show the run that has just ended, not only the ones before it.
    void client.invalidateQueries({ queryKey: didoxRunsKey })
  }, [finished, client])

  const cancel = async () => {
    setCancelling(true)
    try {
      await desktop!.didox!.cancel()
    } catch (e) {
      setCancelling(false)
      toast.error(e instanceof Error ? e.message : "Bekor qilib bo'lmadi")
    }
  }

  const invoices = run?.firms.flatMap((f) => f.invoices) ?? []
  const count = (state: DidoxInvoiceState) => invoices.filter((i) => i.state === state).length
  const summary = [
    `${count('marked')} ta yaratildi`,
    ...(count('needs_check') ? [`${count('needs_check')} ta e'tibor kerak`] : []),
    ...(count('skipped') ? [`${count('skipped')} ta o'tkazib yuborildi`] : []),
    ...(count('error') ? [`${count('error')} ta xato`] : []),
  ].join(' · ')
  const attention = invoices.filter((i) => i.state === 'needs_check' || i.state === 'error')
  const failedFirms = run?.firms.filter((f) => f.status === 'failed') ?? []

  return (
    <Dialog open onOpenChange={(open) => !running && onOpenChange(open)}>
      <DialogContent className="sm:max-w-lg" showCloseButton={!running}>
        <DialogHeader>
          <DialogTitle>Didox'da qoralama yaratish</DialogTitle>
          <DialogDescription>{formatMonth(month)}</DialogDescription>
        </DialogHeader>

        {!started && (
          <div className="grid gap-2 text-sm">
            <p>
              {pending === 1
                ? 'Bitta faktura uchun Didox qoralamasi yaratiladi.'
                : `${pending} ta faktura uchun Didox qoralamasi yaratiladi.`}
            </p>
            <p className="text-muted-foreground">
              Ilova har bir firma nomidan ERI bilan Didox'ga kiradi va formani to'ldiradi; Didox oynasi ko'rinmaydi,
              jarayonni shu yerda kuzatasiz. Hech narsa imzolanmaydi va yuborilmaydi — imzolashni o'zingiz qilasiz.
            </p>
            <Alert>
              <AlertDescription>
                Jarayon davomida klaviatura va sichqonchaga tegmang: E-IMZO parol oynasi qisqa vaqtga chiqadi va
                parol shu kompyuterning klaviaturasi orqali yoziladi.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {running && (
          <p className="text-sm">
            Ilova har bir firma nomidan kirib, fakturalarni qoralama qilib saqlaydi. Hech narsa imzolanmaydi va
            yuborilmaydi. Jarayon davomida klaviatura va sichqonchaga tegmang.
          </p>
        )}

        {log.length > 0 && (
          <ol className="grid max-h-56 gap-1.5 overflow-y-auto text-sm" aria-label="Jarayon">
            {log.map((event) => (
              <li key={`${event.firmTin}:${event.contractId ?? 'firma'}`} className="flex items-start gap-2">
                {event.status === 'running' ? (
                  <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin" aria-label="bajarilmoqda" />
                ) : event.status === 'done' ? (
                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-label="bajarildi" />
                ) : (
                  <X className="text-destructive mt-0.5 size-4 shrink-0" aria-label="xato" />
                )}
                <span>
                  {logLine(event, run)}
                  {event.message && event.status === 'failed' && (
                    <span className="text-muted-foreground">{` — ${event.message}`}</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        )}

        {running && log.length === 0 && (
          <p className="text-muted-foreground flex items-center gap-2 text-sm" aria-busy="true">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Boshlanmoqda…
          </p>
        )}

        {run && run.firms.length > 0 && (
          <div className="grid max-h-64 gap-3 overflow-y-auto" aria-label="Fakturalar holati">
            {run.firms.map((firm) => (
              <div key={firm.tin} className="grid gap-1">
                <p className="text-sm font-medium">
                  {firm.name}
                  <span className="text-muted-foreground font-normal">{` (STIR ${firm.tin})`}</span>
                </p>
                <ul className="grid gap-0.5">
                  {firm.invoices.map((invoice) => (
                    <li key={invoice.contractId} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span>{`№ ${invoice.contractNumber}`}</span>
                      <span className="text-muted-foreground text-xs">{invoice.borrowerName}</span>
                      <span className="font-mono text-xs tabular-nums">{formatMoney(invoice.amount)}</span>
                      <span className={STATE_CLASS[invoice.state] ?? 'text-muted-foreground'}>
                        {STATE_LABELS[invoice.state]}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {finished && run && (
          <Alert role="status">
            <AlertDescription className="grid gap-1">
              <p className="font-medium">{`${RUN_LABELS[run.status]}: ${summary}`}</p>
              {run.failure && <p>{run.failure.message}</p>}
              {failedFirms.map((firm) => (
                <p key={firm.tin}>{`${firm.name}: ${firm.message ?? 'firma uchun qoralama yaratilmadi'}`}</p>
              ))}
              {attention.map((invoice) => (
                <AttentionLine key={invoice.contractId} invoice={invoice} />
              ))}
            </AlertDescription>
          </Alert>
        )}

        {status.error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>
              {`Jarayon holatini o'qib bo'lmadi: ${status.error instanceof Error ? status.error.message : String(status.error)}`}
            </AlertDescription>
          </Alert>
        )}

        {startFailure && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{startFailure.message}</AlertDescription>
          </Alert>
        )}

        {start.error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>
              {`Qoralama yaratishni boshlab bo'lmadi: ${start.error instanceof Error ? start.error.message : String(start.error)}`}
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2">
          {!started ? (
            <>
              <Button type="button" variant="outline" className="h-9" onClick={() => onOpenChange(false)}>
                Bekor qilish
              </Button>
              <Button type="button" className="h-9" onClick={() => setStarted(true)}>
                Boshlash
              </Button>
            </>
          ) : running ? (
            <Button type="button" variant="outline" className="h-9" disabled={cancelling} onClick={cancel}>
              {cancelling && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              Bekor qilish
            </Button>
          ) : (
            <Button type="button" variant="outline" className="h-9" onClick={() => onOpenChange(false)}>
              Yopish
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** A draft a person must look at: why, and the Didox ID when the app got that far. */
function AttentionLine({ invoice }: { invoice: DidoxRunInvoice }) {
  return (
    <p>
      {`№ ${invoice.contractNumber} — ${invoice.message ?? STATE_LABELS[invoice.state]}`}
      {invoice.didoxId && <span className="text-xs break-all">{` · Didox ID ${invoice.didoxId}`}</span>}
    </p>
  )
}
