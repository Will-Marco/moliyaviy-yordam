import { ArrowRight, FileText, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { QueryErrorState } from '@/components/QueryErrorState'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useCompanies } from '@/features/companies/api'
import { formatDate, formatMoney, formatRate } from '@/lib/format'
import { useContracts } from './api'
import { ContractFormDialog } from './ContractFormDialog'

export function ContractsPage() {
  const contracts = useContracts()
  const companies = useCompanies()
  const [formOpen, setFormOpen] = useState(false)
  const notEnoughCompanies = companies.data !== undefined && companies.data.length < 2
  const canCreate = !notEnoughCompanies && companies.data !== undefined

  const openButton = (variant: 'default' | 'outline' = 'default') => (
    <Button variant={variant} className="h-9" onClick={() => setFormOpen(true)} disabled={!canCreate}>
      <Plus aria-hidden="true" />
      Shartnoma ochish
    </Button>
  )

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

      {contracts.error ? (
        <QueryErrorState error={contracts.error} onRetry={() => contracts.refetch()} />
      ) : contracts.isPending ? (
        <Card className="text-muted-foreground p-8 text-center text-sm" aria-busy="true">
          Yuklanmoqda…
        </Card>
      ) : contracts.data.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <FileText className="text-muted-foreground size-8" aria-hidden="true" />
          <p className="font-medium">Hali shartnoma yo'q</p>
          {canCreate && openButton('outline')}
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Shartnoma</TableHead>
                <TableHead>Tomonlar</TableHead>
                <TableHead className="text-right">Summa (limit)</TableHead>
                <TableHead>Muddat</TableHead>
                <TableHead className="text-right">Stavka</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.data.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link to={`/contracts/${c.id}`} className="text-primary font-medium hover:underline">
                      № {c.number}
                    </Link>
                    <div className="text-muted-foreground text-xs tabular-nums">{formatDate(c.signedOn)}</div>
                  </TableCell>
                  <TableCell className="min-w-56 whitespace-normal">
                    <span className="font-medium">{c.lender.name}</span>
                    <span className="sr-only"> dan </span>
                    <ArrowRight className="text-muted-foreground mx-1.5 inline size-3.5" aria-hidden="true" />
                    <span className="font-medium">{c.borrower.name}</span>
                    <span className="sr-only"> ga</span>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{formatMoney(c.limitAmount)}</TableCell>
                  <TableCell className="tabular-nums">{`${formatDate(c.startDate)} – ${formatDate(c.endDate)}`}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatRate(c.currentRate.ratePercent)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {formOpen && <ContractFormDialog open onOpenChange={setFormOpen} />}
    </section>
  )
}
