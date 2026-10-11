import { ArrowDown, ArrowUp, ArrowUpDown, FileDown, FileText, LoaderCircle, Plus, Search, X } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { NativeSelect } from '@/components/NativeSelect'
import { QueryErrorState } from '@/components/QueryErrorState'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useCompanies } from '@/features/companies/api'
import { tashkentToday } from '@/lib/dates'
import { formatDate, formatMoney, formatMonth, formatRate, isNegativeMoney, sumMoney } from '@/lib/format'
import { isUnauthorized } from '@/lib/api'
import { cn } from '@/lib/utils'
import { type Contract, type Party, useContracts } from './api'
import { ContractFormDialog } from './ContractFormDialog'
import {
  filterContracts,
  type ListFilters,
  type PeriodPreset,
  periodPreset,
  type SortDir,
  type SortKind,
  sortBy,
} from './contractList'
import { type PeriodRow, useExportPeriod, usePeriodReport } from './period-api'

/** A table row: the contract plus, when a period is chosen, its figures for that period (FR-12.2). */
interface Row {
  contract: Contract
  period?: PeriodRow
}

interface Column {
  key: string
  label: string
  kind: SortKind
  value: (row: Row) => string
  money?: boolean
  cell: (row: Row) => ReactNode
}

const party = (p: Party) => (
  <>
    <div className="font-medium">{p.name}</div>
    <div className="text-muted-foreground font-mono text-xs">{p.tin}</div>
  </>
)

const money = (value: string) => (
  <span className={cn(isNegativeMoney(value) && 'text-destructive')}>{formatMoney(value)}</span>
)

const moneyColumn = (key: string, label: string, value: (row: Row) => string): Column => ({
  key,
  label,
  kind: 'money',
  money: true,
  value,
  cell: (row) => money(value(row)),
})

const COMMON: Column[] = [
  {
    key: 'contract',
    label: 'Shartnoma',
    kind: 'date',
    value: (r) => r.contract.signedOn,
    cell: ({ contract: c }) => (
      <>
        <Link to={`/contracts/${c.id}`} className="text-primary font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
          № {c.number}
        </Link>
        <div className="text-muted-foreground text-xs tabular-nums">{formatDate(c.signedOn)}</div>
      </>
    ),
  },
  { key: 'lender', label: 'Beruvchi', kind: 'text', value: (r) => r.contract.lender.name, cell: (r) => party(r.contract.lender) },
  { key: 'borrower', label: 'Oluvchi', kind: 'text', value: (r) => r.contract.borrower.name, cell: (r) => party(r.contract.borrower) },
]

/** Today's state (FR-2.3). */
const TODAY_COLUMNS: Column[] = [
  ...COMMON,
  moneyColumn('limit', 'Summa (limit)', (r) => r.contract.limitAmount),
  moneyColumn('disbursed', 'Jami berilgan', (r) => r.contract.totals.disbursed),
  moneyColumn('balance', 'Qoldiq', (r) => r.contract.totals.principalBalance),
  moneyColumn('interestDebt', 'Foiz qarzi', (r) => r.contract.totals.interestDebt),
  {
    key: 'term',
    label: 'Muddat',
    kind: 'date',
    value: (r) => r.contract.endDate,
    cell: ({ contract: c }) => <span className="tabular-nums">{`${formatDate(c.startDate)} – ${formatDate(c.endDate)}`}</span>,
  },
  {
    key: 'rate',
    label: 'Stavka',
    kind: 'money',
    money: true,
    value: (r) => r.contract.currentRate.ratePercent,
    cell: (r) => formatRate(r.contract.currentRate.ratePercent),
  },
]

/** The chosen period (FR-12.2). */
const PERIOD_COLUMNS: Column[] = [
  ...COMMON,
  moneyColumn('p-disbursed', 'Berildi', (r) => r.period!.disbursed),
  moneyColumn('p-repaid', 'Qaytarildi', (r) => r.period!.repaid),
  moneyColumn('p-interest', 'Hisoblangan foiz', (r) => r.period!.interest),
  moneyColumn('p-interestPaid', "To'langan foiz", (r) => r.period!.interestPaid),
  moneyColumn('p-closingBalance', 'Qoldiq (davr oxiri)', (r) => r.period!.closingBalance),
  moneyColumn('p-interestDebt', 'Foiz qarzi (davr oxiri)', (r) => r.period!.interestDebt),
]

const PRESETS: [PeriodPreset, string][] = [
  ['month', 'Joriy oy'],
  ['lastMonth', "O'tgan oy"],
  ['quarter', 'Joriy chorak'],
  ['lastQuarter', "O'tgan chorak"],
  ['year', 'Joriy yil'],
  ['lastYear', "O'tgan yil"],
]

const uniqueParties = (parties: Party[]) =>
  [...new Map(parties.map((p) => [p.id, p])).values()].sort((a, b) => a.name.localeCompare(b.name))

export function ContractsPage() {
  const contracts = useContracts()
  const companies = useCompanies()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [formOpen, setFormOpen] = useState(false)
  const exportPeriod = useExportPeriod()
  const currentMonth = tashkentToday().slice(0, 7)

  const get = (key: string) => params.get(key) ?? ''
  const set = (values: Record<string, string>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [key, value] of Object.entries(values)) {
          if (value) next.set(key, value)
          else next.delete(key)
        }
        return next
      },
      { replace: true },
    )

  const filters: ListFilters = {
    q: get('q'),
    lender: get('lender'),
    borrower: get('borrower'),
    signedFrom: get('signedFrom'),
    signedTo: get('signedTo'),
  }
  const filtered = Object.values(filters).some(Boolean)
  const periodFrom = get('from')
  const periodTo = get('to')
  const periodInvalid = !!periodFrom && !!periodTo && periodFrom > periodTo
  const periodActive = !!periodFrom && !!periodTo && !periodInvalid
  const period = usePeriodReport(periodFrom, periodTo, periodActive)

  const notEnoughCompanies = companies.data !== undefined && companies.data.length < 2
  const canCreate = !notEnoughCompanies && companies.data !== undefined
  const all = contracts.data ?? []
  const lenders = uniqueParties(all.map((c) => c.lender))
  const borrowers = uniqueParties(all.map((c) => c.borrower))

  const columns = periodActive ? PERIOD_COLUMNS : TODAY_COLUMNS
  const byContract = new Map(period.data?.rows.map((r) => [r.contractId, r]))
  // In a period, contracts that start after it have no row (FR-12.2).
  const rows: Row[] = filterContracts(all, filters).flatMap((contract) => {
    if (!periodActive) return [{ contract }]
    const row = byContract.get(contract.id)
    return row ? [{ contract, period: row }] : []
  })
  const sortKey = get('sort')
  const sortDir: SortDir = get('dir') === 'desc' ? 'desc' : 'asc'
  const sortColumn = columns.find((c) => c.key === sortKey)
  const shown = sortColumn ? sortBy(rows, sortColumn.value, sortColumn.kind, sortDir) : rows

  const toggleSort = (key: string) =>
    set({ sort: key, dir: sortKey === key && sortDir === 'asc' ? 'desc' : 'asc' })

  const exportXlsx = () =>
    exportPeriod.mutate(
      { from: periodFrom, to: periodTo, contractIds: shown.map((r) => r.contract.id) },
      { onError: (error) => !isUnauthorized(error) && toast.error(error.message) },
    )

  const openButton = (variant: 'default' | 'outline' = 'default') => (
    <Button variant={variant} className="h-9" onClick={() => setFormOpen(true)} disabled={!canCreate}>
      <Plus aria-hidden="true" />
      Shartnoma ochish
    </Button>
  )

  const tableBusy = periodActive && period.isPending

  return (
    <section className="grid gap-4" aria-labelledby="contracts-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 id="contracts-title" className="text-2xl font-semibold">
            Shartnomalar
          </h1>
          <p className="text-muted-foreground text-sm">Firmalararo moliyaviy yordam shartnomalari</p>
        </div>
        {openButton()}
      </div>

      {notEnoughCompanies && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm">Shartnoma ochish uchun kamida ikkita firma kerak</p>
          <Button asChild variant="outline" className="h-9">
            <Link to="/companies">Firmalarga o'tish</Link>
          </Button>
        </Card>
      )}

      {all.length > 0 && (
        <Card className="grid gap-3 p-4">
          {/* FR-11.1/11.2 */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid min-w-56 flex-1 gap-1.5">
              <Label htmlFor="contracts-search">Qidirish</Label>
              <div className="relative">
                <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" aria-hidden="true" />
                <Input
                  id="contracts-search"
                  type="search"
                  className="h-9 pl-8"
                  placeholder="Raqam, firma nomi yoki STIR"
                  value={filters.q}
                  onChange={(e) => set({ q: e.target.value })}
                />
              </div>
            </div>
            <PartyFilter id="filter-lender" label="Beruvchi" parties={lenders} value={filters.lender} onChange={(v) => set({ lender: v })} />
            <PartyFilter
              id="filter-borrower"
              label="Oluvchi"
              parties={borrowers}
              value={filters.borrower}
              onChange={(v) => set({ borrower: v })}
            />
            <div className="grid gap-1.5">
              <Label htmlFor="filter-signed-from">Imzolangan: dan</Label>
              <Input
                id="filter-signed-from"
                type="date"
                className="h-9"
                value={filters.signedFrom}
                onChange={(e) => set({ signedFrom: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="filter-signed-to">Imzolangan: gacha</Label>
              <Input
                id="filter-signed-to"
                type="date"
                className="h-9"
                value={filters.signedTo}
                onChange={(e) => set({ signedTo: e.target.value })}
              />
            </div>
            {filtered && (
              <Button
                variant="ghost"
                className="h-9"
                onClick={() => set({ q: '', lender: '', borrower: '', signedFrom: '', signedTo: '' })}
              >
                <X aria-hidden="true" />
                Filtrlarni tozalash
              </Button>
            )}
          </div>

          {/* FR-12.1 */}
          <div className="flex flex-wrap items-end gap-3 border-t pt-3">
            <div className="grid gap-1.5">
              <Label htmlFor="period-from">Davr: dan</Label>
              <Input
                id="period-from"
                type="month"
                className="h-9"
                value={periodFrom}
                max={currentMonth}
                onChange={(e) => set({ from: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="period-to">Davr: gacha</Label>
              <Input
                id="period-to"
                type="month"
                className="h-9"
                value={periodTo}
                max={currentMonth}
                onChange={(e) => set({ to: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="period-preset">Tezkor tanlov</Label>
              <NativeSelect
                id="period-preset"
                value=""
                onChange={(e) => {
                  const [from, to] = periodPreset(e.target.value as PeriodPreset, tashkentToday())
                  set({ from, to })
                }}
              >
                <option value="" disabled>
                  Tanlang…
                </option>
                {PRESETS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            {(periodFrom || periodTo) && (
              <Button variant="ghost" className="h-9" onClick={() => set({ from: '', to: '' })}>
                <X aria-hidden="true" />
                Bugungi holat
              </Button>
            )}
            {periodActive && (
              <Button variant="outline" className="h-9" disabled={exportPeriod.isPending || tableBusy || !shown.length} onClick={exportXlsx}>
                {exportPeriod.isPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <FileDown aria-hidden="true" />}
                Excel (davr)
              </Button>
            )}
          </div>
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm" aria-live="polite">
            {periodInvalid ? (
              <p className="text-destructive">Davr boshi oxiridan keyin bo'lishi mumkin emas</p>
            ) : (
              <p className="text-muted-foreground">
                {periodActive
                  ? `Davr: ${formatMonth(periodFrom)} – ${formatMonth(periodTo)}. Harakat — davr ichida, qoldiq va qarz — davr oxiriga.`
                  : "Bugungi holat. Davr tanlansa, jadval shu davr harakatini ko'rsatadi."}
              </p>
            )}
            <p className="text-muted-foreground">
              {`${filtered || periodActive ? `${shown.length} / ${all.length}` : all.length} ta shartnoma`}
            </p>
          </div>
        </Card>
      )}

      {contracts.error ? (
        <QueryErrorState error={contracts.error} onRetry={() => contracts.refetch()} />
      ) : periodActive && period.error ? (
        <QueryErrorState error={period.error} onRetry={() => period.refetch()} />
      ) : contracts.isPending || tableBusy ? (
        <Card className="text-muted-foreground p-8 text-center text-sm" aria-busy="true">
          Yuklanmoqda…
        </Card>
      ) : all.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <FileText className="text-muted-foreground size-8" aria-hidden="true" />
          <p className="font-medium">Hali shartnoma yo'q</p>
          {canCreate && openButton('outline')}
        </Card>
      ) : shown.length === 0 ? (
        <Card className="text-muted-foreground p-8 text-center text-sm">
          {periodActive && !filtered ? "Bu davrda amal qilgan shartnoma yo'q" : "Filtr bo'yicha shartnoma topilmadi"}
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((col) => (
                  <TableHead
                    key={col.key}
                    className={cn(col.money && 'text-right')}
                    aria-sort={sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                  >
                    <button
                      type="button"
                      className={cn('hover:text-foreground inline-flex items-center gap-1', col.money && 'flex-row-reverse')}
                      onClick={() => toggleSort(col.key)}
                    >
                      {col.label}
                      {sortKey !== col.key ? (
                        <ArrowUpDown className="size-3.5 opacity-40" aria-hidden="true" />
                      ) : sortDir === 'asc' ? (
                        <ArrowUp className="size-3.5" aria-hidden="true" />
                      ) : (
                        <ArrowDown className="size-3.5" aria-hidden="true" />
                      )}
                    </button>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((row) => (
                <TableRow
                  key={row.contract.id}
                  className="cursor-pointer"
                  onClick={() => {
                    // Selecting text (e.g. to copy a STIR) must not open the contract.
                    if (!window.getSelection()?.toString()) navigate(`/contracts/${row.contract.id}`)
                  }}
                >
                  {columns.map((col) => (
                    <TableCell
                      key={col.key}
                      className={cn(
                        col.money ? 'text-right font-mono tabular-nums' : 'min-w-40 whitespace-normal',
                        col.key === 'contract' && 'min-w-28',
                      )}
                    >
                      {col.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {periodActive && (
                <TableRow className="bg-muted/50 hover:bg-muted/50 font-semibold">
                  <TableCell colSpan={COMMON.length}>Jami</TableCell>
                  {PERIOD_COLUMNS.slice(COMMON.length).map((col) => (
                    <TableCell key={col.key} className="text-right font-mono tabular-nums">
                      {money(sumMoney(shown.map(col.value)))}
                    </TableCell>
                  ))}
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {formOpen && <ContractFormDialog open onOpenChange={setFormOpen} />}
    </section>
  )
}

function PartyFilter(props: { id: string; label: string; parties: Party[]; value: string; onChange: (value: string) => void }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={props.id}>{props.label}</Label>
      <NativeSelect id={props.id} className="max-w-60" value={props.value} onChange={(e) => props.onChange(e.target.value)}>
        <option value="">Barchasi</option>
        {props.parties.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </NativeSelect>
    </div>
  )
}
