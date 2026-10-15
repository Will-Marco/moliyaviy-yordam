import { Receipt, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { CopyButton } from '@/components/CopyButton'
import { NativeSelect } from '@/components/NativeSelect'
import { QueryErrorState } from '@/components/QueryErrorState'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { DidoxInvoiceFlags } from '@/lib/desktop'
import { useDesktop } from '@/lib/desktop'
import { formatDate, formatInstantDate, formatMoney, formatMonth } from '@/lib/format'
import { type Invoice, useInvoices, useUnmarkDraft } from './api'
import { useDesktopInstall, useDidoxFlags, useResolveNeedsCheck, useSkipInvoice } from './didoxApi'
import { DidoxNeedsCheckActions, DidoxNeedsCheckBadge, DidoxSkippedBadge, SkipButton, UnskipButton } from './DidoxRowFlags'
import { DidoxRunDialog } from './DidoxRunDialog'
import { DidoxRunsCard } from './DidoxRunsCard'
import { MarkDraftDialog } from './MarkDraftDialog'

/** Module 7: invoices to prepare in Didox for a completed month — every field one click from the clipboard. */
export function InvoicesPage() {
  const [params, setParams] = useSearchParams()
  const invoices = useInvoices(params.get('month') ?? undefined)
  const lenderId = params.get('lender') ?? ''
  const [marking, setMarking] = useState<Invoice | null>(null)
  const [unmarking, setUnmarking] = useState<Invoice | null>(null)
  const [creatingDrafts, setCreatingDrafts] = useState(false)
  // Older desktop builds (and a plain browser) cannot create drafts; the whole run is then out of reach.
  const didox = useDesktop()?.didox
  const canCreateDrafts = !!didox?.createDrafts
  // Null in a plain browser: then every needs-check names the computer that has to look into it.
  const thisInstall = useDesktopInstall()?.label ?? null

  const data = invoices.data
  const month = data?.month ?? null
  const unmark = useUnmarkDraft(month ?? '')
  // The robot's marks for this month, from the server (M13): the same in every accountant's app and browser.
  const flags = useDidoxFlags(month)
  const flagsOf = (contractId: string): DidoxInvoiceFlags | undefined => flags.data?.[contractId]
  const skip = useSkipInvoice(month ?? '')
  const resolve = useResolveNeedsCheck(month ?? '')
  const rows = (data?.rows ?? []).filter((r) => !lenderId || r.lender.id === lenderId)
  const drafted = rows.filter((r) => r.draft).length
  // The run covers every lender of the month, so the lender filter does not narrow what it would do.
  // An invoice an accountant told the robot to leave alone is not waiting for a draft either (spec §7).
  const needDraft = (data?.rows ?? []).filter((r) => r.draft === null && !flagsOf(r.contractId)?.skipped).length

  const onSkip = (r: Invoice, next: boolean) =>
    skip.mutate(
      { contractId: r.contractId, skip: next },
      {
        onSuccess: () => toast.success(next ? "Faktura o'tkazib yuboriladi" : "O'tkazib yuborish bekor qilindi"),
        onError: (e) => toast.error(e instanceof Error ? e.message : "O'zgartirib bo'lmadi"),
      },
    )
  const onResolve = (r: Invoice) =>
    resolve.mutate(r.contractId, {
      onSuccess: () => toast.success('Belgi olib tashlandi'),
      onError: (e) => toast.error(e instanceof Error ? e.message : "O'zgartirib bo'lmadi"),
    })

  const setParam = (key: 'month' | 'lender', value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )

  return (
    <section className="grid gap-4" aria-labelledby="invoices-title">
      <div>
        <h1 id="invoices-title" className="text-2xl font-semibold">
          Fakturalar
        </h1>
        <p className="text-muted-foreground text-sm">Tugagan oy uchun Didox'da tayyorlanadigan schyot-fakturalar</p>
      </div>

      {data && data.months.length > 0 && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="invoice-month">Oy</Label>
            <NativeSelect
              id="invoice-month"
              value={month ?? ''}
              onChange={(e) => setParam('month', e.target.value)}
            >
              {data.months.map((m) => (
                <option key={m} value={m}>
                  {formatMonth(m)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="invoice-lender">Beruvchi</Label>
            <NativeSelect
              id="invoice-lender"
              value={lenderId}
              onChange={(e) => setParam('lender', e.target.value)}
            >
              <option value="">Barcha beruvchilar</option>
              {data.lenders.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          {rows.length > 0 && (
            <p className="text-muted-foreground pb-2 text-sm" aria-live="polite">
              {`${rows.length} ta faktura${drafted ? `, ${drafted} tasi qoralama` : ''}`}
            </p>
          )}
          {canCreateDrafts && month && (
            <Button
              className="mb-0.5 h-9"
              disabled={needDraft === 0}
              title={needDraft === 0 ? "Bu oyda qoralama kutayotgan faktura yo'q" : undefined}
              onClick={() => setCreatingDrafts(true)}
            >
              Didox'da qoralama yaratish
            </Button>
          )}
        </div>
      )}

      {invoices.error ? (
        <div className="grid gap-3">
          <QueryErrorState error={invoices.error} onRetry={() => invoices.refetch()} />
          {params.has('month') && (
            <Button variant="outline" className="h-9 justify-self-start" onClick={() => setParam('month', '')}>
              Oxirgi tugagan oyga o'tish
            </Button>
          )}
        </div>
      ) : !data ? (
        <Card className="text-muted-foreground p-8 text-center text-sm" aria-busy="true">
          Yuklanmoqda…
        </Card>
      ) : data.months.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <Receipt className="text-muted-foreground size-8" aria-hidden="true" />
          <p className="font-medium">Hali tugagan oy yo'q</p>
          <p className="text-muted-foreground text-sm">Faktura shartnoma boshlangan oy tugagach tuziladi</p>
          <Button asChild variant="outline" className="h-9">
            <Link to="/contracts">Shartnomalarga o'tish</Link>
          </Button>
        </Card>
      ) : rows.length === 0 ? (
        <Card className="text-muted-foreground p-8 text-center text-sm">
          {lenderId && data.rows.length ? "Tanlangan beruvchi uchun bu oyda faktura yo'q" : "Bu oy uchun faktura yo'q"}
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0" aria-busy={invoices.isFetching}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Beruvchi</TableHead>
                <TableHead>Oluvchi</TableHead>
                <TableHead>Shartnoma</TableHead>
                <TableHead>Qator nomi</TableHead>
                <TableHead className="text-right">Summa</TableHead>
                <TableHead>Holat</TableHead>
                <TableHead>
                  <span className="sr-only">Amallar</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <InvoiceRow
                  key={r.contractId}
                  invoice={r}
                  flags={flagsOf(r.contractId)}
                  thisInstall={thisInstall}
                  busy={skip.isPending || resolve.isPending}
                  onMark={() => setMarking(r)}
                  onUnmark={() => setUnmarking(r)}
                  onSkip={(next) => onSkip(r, next)}
                  onResolve={() => onResolve(r)}
                />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {month && <DidoxRunsCard month={month} />}

      {marking && month && (
        <MarkDraftDialog
          month={month}
          invoice={marking}
          didoxDocumentId={flagsOf(marking.contractId)?.needsCheck?.didoxId}
          onOpenChange={() => setMarking(null)}
        />
      )}

      {creatingDrafts && month && (
        <DidoxRunDialog month={month} pending={needDraft} onOpenChange={() => setCreatingDrafts(false)} />
      )}

      <AlertDialog open={!!unmarking} onOpenChange={(open) => !open && setUnmarking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Qoralama belgisini olib tashlaysizmi?</AlertDialogTitle>
            <AlertDialogDescription>
              {unmarking &&
                `№ ${unmarking.contract.number} faktura yana "Tayyor" bo'ladi. Didox'dagi qoralamaga ta'sir qilmaydi.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                unmarking &&
                unmark.mutate(unmarking.contractId, {
                  onSuccess: () => toast.success('Belgi olib tashlandi'),
                  onError: (e) => toast.error(e.message),
                })
              }
            >
              Olib tashlash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

interface RowProps {
  invoice: Invoice
  /** Absent unless the server has a Didox mark on this invoice for this month. */
  flags: DidoxInvoiceFlags | undefined
  /** This computer's install label, or null in a plain browser. */
  thisInstall: string | null
  /** A flag change is in flight somewhere in the table — the flag buttons wait for it. */
  busy: boolean
  onMark: () => void
  onUnmark: () => void
  onSkip: (skip: boolean) => void
  onResolve: () => void
}

function InvoiceRow({ invoice: r, flags, thisInstall, busy, onMark, onUnmark, onSkip, onResolve }: RowProps) {
  const amount = formatMoney(r.amount)
  // A drafted month may have lost its interest since; the API only marks positive amounts (FR-7.1).
  const invoiceable = !r.amount.startsWith('-') && /[1-9]/.test(r.amount)
  const signedOn = formatDate(r.contract.signedOn)
  return (
    <TableRow className="align-top">
      <TableCell className="min-w-36 whitespace-normal">
        <div className="font-medium">{r.lender.name}</div>
        <div className="text-muted-foreground font-mono text-xs">{r.lender.tin}</div>
      </TableCell>
      <TableCell className="min-w-40 whitespace-normal">
        <div className="font-medium">{r.borrower.name}</div>
        <div className="flex items-center gap-1">
          <span className="font-mono text-xs">{r.borrower.tin}</span>
          <CopyButton value={r.borrower.tin} label={`oluvchi STIR ${r.borrower.tin}`} />
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <div className="flex items-center gap-1">
          <span className="font-medium">№ {r.contract.number}</span>
          <CopyButton value={r.contract.number} label={`shartnoma raqami ${r.contract.number}`} />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground text-xs tabular-nums">{signedOn}</span>
          <CopyButton value={signedOn} label={`shartnoma sanasi ${signedOn}`} />
        </div>
      </TableCell>
      <TableCell className="min-w-64 whitespace-normal">
        <div className="flex items-start gap-1">
          <span className="text-sm">{r.lineName}</span>
          <CopyButton value={r.lineName} label={`qator nomi ${r.lineName}`} />
        </div>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <span className="font-mono tabular-nums">{amount}</span>
          <CopyButton value={r.amount} label={`summa ${amount}`} />
        </div>
      </TableCell>
      <TableCell className="min-w-40 whitespace-normal">
        {r.draft ? (
          <div className="grid gap-1">
            <Badge className="bg-emerald-100 text-emerald-900">
              {r.draft.source === 'didox' ? 'Qoralama yaratildi (Didox)' : 'Qoralama yaratildi'}
            </Badge>
            <span className="text-muted-foreground text-xs tabular-nums">
              {formatInstantDate(r.draft.draftedAt)}
              {r.draft.didoxDocumentId && ` · ID ${r.draft.didoxDocumentId}`}
            </span>
            {r.draft.amountChanged && (
              <span className="flex items-start gap-1 text-xs text-amber-800">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {`Qoralamada ${formatMoney(r.draft.amount)} — summa o'zgargan, Didox'da tuzating`}
              </span>
            )}
          </div>
        ) : flags?.needsCheck ? (
          <DidoxNeedsCheckBadge needsCheck={flags.needsCheck} thisInstall={thisInstall} />
        ) : flags?.skipped ? (
          <DidoxSkippedBadge />
        ) : (
          <Badge variant="secondary">Tayyor</Badge>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {r.draft ? (
          <div className="grid gap-1">
            {invoiceable && (
              <Button variant="outline" size="sm" aria-label={`Qayta belgilash: № ${r.contract.number}`} onClick={onMark}>
                Qayta belgilash
              </Button>
            )}
            <Button variant="ghost" size="sm" aria-label={`Belgini olib tashlash: № ${r.contract.number}`} onClick={onUnmark}>
              Olib tashlash
            </Button>
          </div>
        ) : flags?.needsCheck ? (
          <DidoxNeedsCheckActions
            contractNumber={r.contract.number}
            disabled={busy}
            onMark={onMark}
            onResolve={onResolve}
            onSkip={onSkip}
          />
        ) : flags?.skipped ? (
          <UnskipButton contractNumber={r.contract.number} disabled={busy} onUnskip={() => onSkip(false)} />
        ) : (
          <div className="grid gap-1">
            <Button variant="outline" size="sm" aria-label={`Qoralama deb belgilash: № ${r.contract.number}`} onClick={onMark}>
              Belgilash
            </Button>
            <SkipButton contractNumber={r.contract.number} disabled={busy} onSkip={() => onSkip(true)} />
          </div>
        )}
      </TableCell>
    </TableRow>
  )
}
