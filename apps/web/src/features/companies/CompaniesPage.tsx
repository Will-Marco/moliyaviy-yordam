import { Building2, FileUp, KeyRound, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { QueryErrorState } from '@/components/QueryErrorState'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useEriKeys } from '@/features/eri/api'
import { EriKeyCell } from '@/features/eri/EriKeyCell'
import { useDesktop } from '@/lib/desktop'
import { type Company, missingRequisites, useCompanies } from './api'
import { CompanyFormDialog } from './CompanyFormDialog'
import { ImportCompaniesDialog } from './ImportCompaniesDialog'

type DialogState = { open: false } | { open: true; company?: Company }

export function CompaniesPage() {
  const companies = useCompanies()
  const [dialog, setDialog] = useState<DialogState>({ open: false })
  const [importOpen, setImportOpen] = useState(false)
  const openNew = () => setDialog({ open: true })
  const desktop = useDesktop()
  const eri = useEriKeys(companies.data?.map((c) => c.tin) ?? [])
  const keys = eri.data?.eimzo === 'ok' ? eri.data.keys : null

  return (
    <section className="grid gap-4" aria-labelledby="companies-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 id="companies-title" className="text-2xl font-semibold">
            Firmalar
          </h1>
          <p className="text-muted-foreground text-sm">Shartnomalarda beruvchi va oluvchi tomonlar</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-9" onClick={() => setImportOpen(true)}>
            <FileUp aria-hidden="true" />
            Didox'dan import
          </Button>
          <Button className="h-9" onClick={openNew}>
            <Plus aria-hidden="true" />
            Firma qo'shish
          </Button>
        </div>
      </div>

      {eri.data && eri.data.eimzo !== 'ok' && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900">
          <KeyRound aria-hidden="true" />
          <AlertDescription className="text-amber-900">
            ERI kalitlarini o'qib bo'lmadi: {eri.data.message}
          </AlertDescription>
        </Alert>
      )}

      {companies.error ? (
        <QueryErrorState error={companies.error} onRetry={() => companies.refetch()} />
      ) : companies.isPending ? (
        <Card className="text-muted-foreground p-8 text-center text-sm" aria-busy="true">
          Yuklanmoqda…
        </Card>
      ) : companies.data.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <Building2 className="text-muted-foreground size-8" aria-hidden="true" />
          <div>
            <p className="font-medium">Hali firma qo'shilmagan</p>
            <p className="text-muted-foreground text-sm">
              Didox fakturalaridan import qiling yoki firmani qo'lda qo'shing.
            </p>
          </div>
          <Button variant="outline" className="h-9" onClick={openNew}>
            <Plus aria-hidden="true" />
            Birinchi firmani qo'shish
          </Button>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nomi</TableHead>
                <TableHead>STIR</TableHead>
                <TableHead>QQS kodi</TableHead>
                <TableHead>Hisob raqami</TableHead>
                <TableHead>MFO</TableHead>
                {desktop && <TableHead>ERI kalit</TableHead>}
                <TableHead className="w-12">
                  <span className="sr-only">Amallar</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.data.map((company) => (
                <TableRow key={company.id}>
                  <TableCell className="max-w-72 min-w-52 whitespace-normal">
                    <div className="font-medium">{company.name}</div>
                    {company.address && <div className="text-muted-foreground text-xs">{company.address}</div>}
                    {missingRequisites(company) && (
                      <Badge variant="outline" className="mt-1 border-amber-300 bg-amber-50 text-amber-900">
                        Rekvizitlar to'liq emas
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">{company.tin}</TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {company.vatRegCode ?? <Dash />}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">{company.bankAccount ?? <Dash />}</TableCell>
                  <TableCell className="font-mono tabular-nums">{company.mfo ?? <Dash />}</TableCell>
                  {desktop && (
                    <TableCell>
                      <EriKeyCell eriKey={keys?.[company.tin]} />
                    </TableCell>
                  )}
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-lg"
                      aria-label={`Tahrirlash: ${company.name}`}
                      onClick={() => setDialog({ open: true, company })}
                    >
                      <Pencil aria-hidden="true" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {importOpen && <ImportCompaniesDialog open onOpenChange={setImportOpen} />}

      {dialog.open && (
        <CompanyFormDialog
          key={dialog.company?.id ?? 'new'}
          open
          company={dialog.company}
          onOpenChange={(open) => !open && setDialog({ open: false })}
        />
      )}
    </section>
  )
}

const Dash = () => <span className="text-muted-foreground">—</span>
