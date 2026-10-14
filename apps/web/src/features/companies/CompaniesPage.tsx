import { Building2, FileUp, KeyRound, LockKeyhole, LogIn, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { QueryErrorState } from '@/components/QueryErrorState'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useEriKeys } from '@/features/eri/api'
import { CheckLoginDialog } from '@/features/eri/CheckLoginDialog'
import { EriKeyCell } from '@/features/eri/EriKeyCell'
import { EriPasswordCell } from '@/features/eri/EriPasswordCell'
import { EriPasswordDialog } from '@/features/eri/EriPasswordDialog'
import { useDesktop } from '@/lib/desktop'
import { type Company, missingRequisites, useCompanies } from './api'
import { CompanyFormDialog } from './CompanyFormDialog'
import { ImportCompaniesDialog } from './ImportCompaniesDialog'

type DialogState = { open: false } | { open: true; company?: Company }

/** Where the app can type the ERI password into E-IMZO's own window (apps/desktop/src/didox/autotype). */
const TYPIST_PLATFORMS = ['darwin', 'win32']

export function CompaniesPage() {
  const companies = useCompanies()
  const [dialog, setDialog] = useState<DialogState>({ open: false })
  const [importOpen, setImportOpen] = useState(false)
  const openNew = () => setDialog({ open: true })
  const desktop = useDesktop()
  const eri = useEriKeys(companies.data?.map((c) => c.tin) ?? [])
  const keys = eri.data?.eimzo === 'ok' ? eri.data.keys : null
  const passwords = eri.data?.passwords
  const [passwordFor, setPasswordFor] = useState<Company | null>(null)
  const [checkFor, setCheckFor] = useState<Company | null>(null)
  // Older desktop builds have no Didox bridge: no column then.
  const canCheck = !!desktop?.didox
  // The E-IMZO typist is written for macOS and Windows; anywhere else the app cannot type the password.
  const checkBlocker = (tin: string) =>
    !TYPIST_PLATFORMS.includes(desktop?.platform ?? '')
      ? "Bu tizimda ishlamaydi (macOS yoki Windows kerak)"
      : keys?.[tin]?.status !== 'ok'
        ? 'Amaldagi ERI kaliti kerak'
        : passwords?.[tin] !== 'set'
          ? 'Avval ERI parolini kiriting'
          : null

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

      {(eri.error || (eri.data && eri.data.eimzo !== 'ok')) && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900">
          <KeyRound aria-hidden="true" />
          <AlertDescription className="text-amber-900">
            ERI kalitlarini o'qib bo'lmadi:{' '}
            {eri.data && eri.data.eimzo !== 'ok' ? eri.data.message : "ilova E-IMZO bilan bog'lana olmadi"}
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
                {desktop && <TableHead>ERI parol</TableHead>}
                {canCheck && <TableHead>Didox</TableHead>}
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
                  {desktop && (
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <EriPasswordCell status={passwords?.[company.tin]} />
                        <Button
                          variant="ghost"
                          size="icon-lg"
                          aria-label={`ERI paroli: ${company.name}`}
                          onClick={() => setPasswordFor(company)}
                        >
                          <LockKeyhole aria-hidden="true" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                  {canCheck && (
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`Kirishni tekshirish: ${company.name}`}
                        title={checkBlocker(company.tin) ?? undefined}
                        disabled={!!checkBlocker(company.tin)}
                        onClick={() => setCheckFor(company)}
                      >
                        <LogIn aria-hidden="true" />
                        Kirishni tekshirish
                      </Button>
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

      {passwordFor && (
        <EriPasswordDialog
          company={passwordFor}
          status={passwords?.[passwordFor.tin]}
          onOpenChange={(open) => !open && setPasswordFor(null)}
        />
      )}

      {checkFor && <CheckLoginDialog company={checkFor} onOpenChange={(open) => !open && setCheckFor(null)} />}

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
