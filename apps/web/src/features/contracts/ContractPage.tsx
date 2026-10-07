import { ArrowLeft, Pencil } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Link, useParams } from 'react-router'
import { QueryErrorState } from '@/components/QueryErrorState'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate, formatMoney, formatRate, isNegativeMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { type Party, useContract } from './api'
import { ContractFormDialog } from './ContractFormDialog'
import { OperationsCard } from './OperationsCard'
import { RatesCard } from './RatesCard'
import { ReportCard } from './ReportCard'

export function ContractPage() {
  const { id = '' } = useParams()
  const contract = useContract(id)
  const [editing, setEditing] = useState(false)

  const back = (
    <Link to="/contracts" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
      <ArrowLeft className="size-4" aria-hidden="true" />
      Shartnomalar
    </Link>
  )

  if (contract.error) {
    return (
      <div className="grid gap-4">
        {back}
        <QueryErrorState error={contract.error} onRetry={() => contract.refetch()} />
      </div>
    )
  }
  if (contract.isPending) {
    return (
      <div className="grid gap-4" aria-busy="true">
        {back}
        <Card className="text-muted-foreground p-8 text-center text-sm">Yuklanmoqda…</Card>
      </div>
    )
  }

  const c = contract.data
  return (
    <section className="grid gap-4" aria-labelledby="contract-title">
      {back}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 id="contract-title" className="text-2xl font-semibold">{`Shartnoma № ${c.number}`}</h1>
          <p className="text-muted-foreground text-sm tabular-nums">{`${formatDate(c.signedOn)} dagi`}</p>
        </div>
        <Button variant="outline" className="h-9" onClick={() => setEditing(true)}>
          <Pencil aria-hidden="true" />
          Tahrirlash
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tomonlar</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <PartyLine role="Beruvchi" party={c.lender} />
            <PartyLine role="Oluvchi" party={c.borrower} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Shartlar</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm">
              <Term label="Summa (limit)">
                <span className="font-mono tabular-nums">{formatMoney(c.limitAmount)} so'm</span>
              </Term>
              <Term label="Muddat">
                <span className="tabular-nums">{`${formatDate(c.startDate)} – ${formatDate(c.endDate)}`}</span>
              </Term>
              <Term label="Joriy stavka">
                <span className="tabular-nums">{formatRate(c.currentRate.ratePercent)}</span>
              </Term>
              <Term label="Jami berilgan">
                <span className="font-mono tabular-nums">{formatMoney(c.totals.disbursed)} so'm</span>
              </Term>
              <Term label="Asosiy qarz qoldig'i">
                <span
                  className={cn(
                    'font-mono tabular-nums',
                    isNegativeMoney(c.totals.principalBalance) && 'text-destructive',
                  )}
                >
                  {formatMoney(c.totals.principalBalance)} so'm
                </span>
              </Term>
              <Term label="Foiz qarzi">
                <span className="font-mono tabular-nums">{formatMoney(c.totals.interestDebt)} so'm</span>
              </Term>
            </dl>
          </CardContent>
        </Card>
      </div>

      <OperationsCard contract={c} />

      <ReportCard contractId={c.id} />

      <RatesCard contract={c} />

      {editing && <ContractFormDialog open contract={c} onOpenChange={setEditing} />}
    </section>
  )
}

function PartyLine({ role, party }: { role: string; party: Party }) {
  return (
    <div>
      <div className="text-muted-foreground text-xs">{role}</div>
      <div className="font-medium">{party.name}</div>
      <div className="text-muted-foreground font-mono text-xs tabular-nums">STIR {party.tin}</div>
    </div>
  )
}

function Term({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  )
}
