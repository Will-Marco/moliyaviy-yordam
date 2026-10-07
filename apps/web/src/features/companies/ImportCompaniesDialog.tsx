import { CircleAlert, FileUp, LoaderCircle } from 'lucide-react'
import { type ChangeEvent, useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  type CompanyInput,
  type ImportFile,
  type ImportItem,
  type ImportStatus,
  useApplyImport,
  usePreviewImport,
} from './api'
import { importSummary } from './importSummary'

const MAX_FILES = 50
const MAX_FILE_BYTES = 1_000_000
// The API accepts JSON bodies up to 10 MB; keep headroom for encoding.
const MAX_TOTAL_BYTES = 9_000_000

const FIELD_LABELS: Record<keyof CompanyInput, string> = {
  name: 'Nomi',
  address: 'Manzil',
  tin: 'STIR',
  vatRegCode: 'QQS kodi',
  bankAccount: 'Hisob raqami',
  mfo: 'MFO',
}

const STATUS: Record<ImportStatus, { label: string; variant: 'default' | 'outline' | 'secondary' | 'destructive' }> = {
  create: { label: 'Yangi', variant: 'default' },
  update: { label: 'Yangilanadi', variant: 'outline' },
  unchanged: { label: "O'zgarishsiz", variant: 'secondary' },
  error: { label: 'Xato', variant: 'destructive' },
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ImportCompaniesDialog({ open, onOpenChange }: Props) {
  const [files, setFiles] = useState<ImportFile[]>([])
  const [fileError, setFileError] = useState<string>()
  const preview = usePreviewImport()
  const apply = useApplyImport()
  const result = preview.data
  const actionable = result?.items.filter((i) => i.status === 'create' || i.status === 'update').length ?? 0

  const onChoose = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(event.target.files ?? [])
    event.target.value = ''
    setFileError(undefined)
    if (!chosen.length) return
    if (chosen.length > MAX_FILES) return setFileError(`Bir yo'la ${MAX_FILES} tadan ko'p fayl tanlab bo'lmaydi`)
    const oversized = chosen.find((file) => file.size > MAX_FILE_BYTES)
    if (oversized) return setFileError(`${oversized.name}: fayl hajmi 1 MB dan oshmasligi kerak`)
    if (chosen.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_BYTES) {
      return setFileError('Fayllar jami hajmi 9 MB dan oshmasligi kerak')
    }

    const read = await Promise.all(chosen.map(async (file) => ({ name: file.name, content: await file.text() })))
    setFiles(read)
    preview.mutate(read)
  }

  const onApply = () =>
    apply.mutate(files, {
      onSuccess: (r) => {
        toast.success(importSummary(r))
        onOpenChange(false)
      },
    })

  const reset = () => {
    preview.reset()
    setFiles([])
  }

  const error = fileError ?? preview.error?.message ?? apply.error?.message

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Didox fakturalaridan import</DialogTitle>
          <DialogDescription>
            Didox'dan yuklab olingan schyot-faktura fayllarini tanlang — sotuvchi va xaridor rekvizitlari olinadi.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive" role="alert">
            <CircleAlert />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!result ? (
          <label
            htmlFor="import-files"
            className="hover:bg-secondary focus-within:ring-ring/50 flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center focus-within:ring-3"
          >
            {preview.isPending ? (
              <LoaderCircle className="text-muted-foreground size-8 animate-spin" aria-hidden="true" />
            ) : (
              <FileUp className="text-muted-foreground size-8" aria-hidden="true" />
            )}
            <span className="font-medium">Faktura fayllarini tanlang</span>
            <span className="text-muted-foreground text-xs">.xls, bir yo'la {MAX_FILES} tagacha, har biri 1 MB gacha</span>
            <input
              id="import-files"
              type="file"
              multiple
              accept=".xls,.htm,.html"
              className="sr-only"
              disabled={preview.isPending}
              onChange={onChoose}
            />
          </label>
        ) : (
          <div className="grid gap-3">
            {result.fileErrors.length > 0 && (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertDescription>
                  <ul className="list-inside list-disc">
                    {result.fileErrors.map((e) => (
                      <li key={e.file}>
                        {e.file}: {e.message}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            <div className="max-h-[50dvh] overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Firma</TableHead>
                    <TableHead>Holat</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.items.map((item) => (
                    <ImportRow key={`${item.tin}|${item.name}|${item.source.file}`} item={item} />
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button type="button" variant="outline" className="h-9" onClick={reset} disabled={apply.isPending}>
              Boshqa fayllar
            </Button>
          ) : (
            <DialogClose asChild>
              <Button type="button" variant="outline" className="h-9">
                Bekor qilish
              </Button>
            </DialogClose>
          )}
          {result && (
            <Button className="h-9" onClick={onApply} disabled={actionable === 0 || apply.isPending}>
              {apply.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              Import qilish ({actionable})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ImportRow({ item }: { item: ImportItem }) {
  const status = STATUS[item.status]
  const detail =
    item.status === 'update'
      ? item.changes.map((field) => FIELD_LABELS[field]).join(', ')
      : item.status === 'error'
        ? Object.values(item.errors).flat().join('; ')
        : null
  return (
    <TableRow>
      <TableCell className="min-w-40 align-top whitespace-normal">
        <div className="font-medium">{item.name || '—'}</div>
        <div className="text-muted-foreground font-mono text-xs tabular-nums">{item.tin || '—'}</div>
        <div className="text-muted-foreground text-xs">
          {item.source.file}
          {item.source.invoiceNo && ` · № ${item.source.invoiceNo}`}
        </div>
      </TableCell>
      <TableCell className="min-w-32 align-top whitespace-normal">
        <Badge variant={status.variant}>{status.label}</Badge>
        {detail && (
          <div className={item.status === 'error' ? 'text-destructive mt-1 text-xs' : 'text-muted-foreground mt-1 text-xs'}>
            {detail}
          </div>
        )}
      </TableCell>
    </TableRow>
  )
}
