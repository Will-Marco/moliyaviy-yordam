import { ChevronRight, FileDown } from 'lucide-react'
import { Fragment, type ReactNode, useState } from 'react'
import { QueryErrorState } from '@/components/QueryErrorState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDayMonth, formatDecimal, formatMoney, formatMonth, formatRate, isNegativeMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { type ReportMonth, useReport } from './report-api'

const COLUMNS = 10

/** FR-4.1/4.2: monthly interest with the segments behind every figure. */
export function ReportCard({ contractId }: { contractId: string }) {
  const report = useReport(contractId)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (month: string) =>
    setOpen((current) => {
      const next = new Set(current)
      if (!next.delete(month)) next.add(month)
      return next
    })

  return (
    <Card className="gap-0 p-0">
      <CardHeader className="p-4">
        <CardTitle className="text-base">Oylik hisobot</CardTitle>
        <CardDescription>Foiz har kun oxiridagi qoldiq bo'yicha hisoblanadi, oy yakuni tiyinga yaxlitlanadi.</CardDescription>
        <CardAction>
          {/* Same-origin GET: the session cookie travels; the server builds the file from this report (FR-6.1). */}
          <Button asChild variant="outline" className="h-9">
            <a href={`/api/contracts/${contractId}/report.xlsx`} download>
              <FileDown aria-hidden="true" />
              Excel yuklab olish
            </a>
          </Button>
        </CardAction>
      </CardHeader>

      {report.error ? (
        <div className="p-4 pt-0">
          <QueryErrorState error={report.error} onRetry={() => report.refetch()} />
        </div>
      ) : report.isPending ? (
        <p className="text-muted-foreground border-t p-6 text-center text-sm" aria-busy="true">
          Hisoblanmoqda…
        </p>
      ) : report.data.months.length === 0 ? (
        <p className="text-muted-foreground border-t p-6 text-center text-sm">
          Shartnoma hali boshlanmagan — foiz hisoblanmagan.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto border-t">
            <Table aria-label="Oylik hisobot">
              <TableHeader>
                <TableRow>
                  <TableHead>Oy</TableHead>
                  <TableHead className="text-right">Stavka</TableHead>
                  <TableHead className="text-right">Boshidagi qoldiq</TableHead>
                  <TableHead className="text-right">Berildi</TableHead>
                  <TableHead className="text-right">Qaytarildi</TableHead>
                  <TableHead className="text-right">Oxiridagi qoldiq</TableHead>
                  <TableHead className="text-right">Hisoblangan foiz</TableHead>
                  <TableHead className="text-right">To'langan foiz</TableHead>
                  <TableHead className="text-right">Foiz qarzi</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">Bo'laklar</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.data.months.map((m) => (
                  <MonthRows key={m.month} month={m} expanded={open.has(m.month)} onToggle={() => toggle(m.month)} />
                ))}
              </TableBody>
            </Table>
          </div>
          <dl className="grid gap-x-6 gap-y-2 border-t p-4 text-sm sm:grid-cols-2">
            <Total label="Bugungacha hisoblangan">{formatMoney(report.data.totals.interestAccrued)}</Total>
            <Total label="To'langan foiz">{formatMoney(report.data.totals.interestPaid)}</Total>
            <Total label="Foiz qarzi (bugungacha)">{formatMoney(report.data.totals.interestDebt)}</Total>
            <Total label="Foiz qarzi (tugagan oylar)">{formatMoney(report.data.totals.interestDebtCompleted)}</Total>
          </dl>
        </>
      )}
    </Card>
  )
}

function MonthRows({ month: m, expanded, onToggle }: { month: ReportMonth; expanded: boolean; onToggle: () => void }) {
  const name = formatMonth(m.month)
  const money = (value: string, extra?: string) => (
    <TableCell className={cn('text-right font-mono tabular-nums', isNegativeMoney(value) && 'text-destructive', extra)}>
      {formatMoney(value)}
    </TableCell>
  )
  return (
    <Fragment>
      <TableRow data-month={m.month} className={cn(m.partial && 'bg-muted/40')}>
        <TableCell className="whitespace-nowrap">
          <span className="font-medium">{name}</span>
          {m.partial && (
            <Badge variant="secondary" className="ml-2">
              {`${formatDayMonth(m.to)} gacha`}
            </Badge>
          )}
        </TableCell>
        <TableCell className="text-right tabular-nums">{m.rates.map(formatRate).join(' → ')}</TableCell>
        {money(m.openingBalance)}
        {money(m.disbursed)}
        {money(m.repaid)}
        {money(m.closingBalance)}
        {money(m.interest, 'font-semibold')}
        {money(m.interestPaid)}
        {money(m.interestDebt)}
        <TableCell>
          <button
            type="button"
            className="hover:bg-secondary focus-visible:ring-ring/50 flex size-8 items-center justify-center rounded-md focus-visible:ring-3 focus-visible:outline-none"
            aria-expanded={expanded}
            aria-controls={`segments-${m.month}`}
            aria-label={`${name}: bo'laklarni ${expanded ? 'yashirish' : "ko'rsatish"}`}
            onClick={onToggle}
          >
            <ChevronRight className={cn('size-4 transition-transform', expanded && 'rotate-90')} aria-hidden="true" />
          </button>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow id={`segments-${m.month}`} className="hover:bg-transparent">
          <TableCell colSpan={COLUMNS} className="bg-muted/30 p-3">
            <Table aria-label={`${name} bo'laklari`} className="bg-card rounded-md">
              <TableHeader>
                <TableRow>
                  <TableHead>Davr</TableHead>
                  <TableHead className="text-right">Kun</TableHead>
                  <TableHead className="text-right">Qoldiq</TableHead>
                  <TableHead className="text-right">Stavka</TableHead>
                  <TableHead className="text-right">Yil kunlari</TableHead>
                  <TableHead className="text-right">Foiz (aniq)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {m.segments.map((s) => (
                  <TableRow key={s.from}>
                    <TableCell className="tabular-nums">{`${formatDayMonth(s.from)} – ${formatDayMonth(s.to)}`}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.days}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatMoney(s.balance)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatRate(s.ratePercent)}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.yearDays}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatDecimal(s.interestExact)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="text-muted-foreground text-right text-xs">
                    Oy jami (aniq) → yaxlitlangan
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {`${formatDecimal(m.interestExact)} → ${formatMoney(m.interest)}`}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  )
}

function Total({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono font-medium tabular-nums">{children}</dd>
    </div>
  )
}
