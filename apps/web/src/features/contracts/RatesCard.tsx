import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
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
import { Card, CardAction, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate, formatRate } from '@/lib/format'
import { type Contract, type Rate, useDeleteRate } from './api'
import { RateDialog } from './RateDialog'

type DialogState = { open: false } | { open: true; initial?: Rate }

/** Plain-space label for screen readers and tests ("16 %, 01.04.2026 dan"). */
const describe = (rate: Rate) => `${rate.ratePercent.replace('.', ',')} %, ${formatDate(rate.effectiveFrom)} dan`

/** Module 5: rate history — add a change, delete a change, correct the initial rate. */
export function RatesCard({ contract }: { contract: Contract }) {
  const remove = useDeleteRate(contract.id)
  const [dialog, setDialog] = useState<DialogState>({ open: false })
  const [deleting, setDeleting] = useState<Rate | null>(null)

  return (
    <Card className="gap-0 p-0">
      <CardHeader className="p-4">
        <CardTitle className="text-base">Stavkalar tarixi</CardTitle>
        <CardAction>
          <Button variant="outline" className="h-9" onClick={() => setDialog({ open: true })}>
            <Plus aria-hidden="true" />
            Stavkani o'zgartirish
          </Button>
        </CardAction>
      </CardHeader>
      <div className="overflow-x-auto border-t">
        <Table aria-label="Stavkalar tarixi">
          <TableHeader>
            <TableRow>
              <TableHead>Amal qiladi</TableHead>
              <TableHead>Kiritilgan sana</TableHead>
              <TableHead className="text-right">Stavka</TableHead>
              <TableHead className="w-14">
                <span className="sr-only">Amallar</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(contract.rates ?? []).map((rate) => (
              <TableRow key={rate.id}>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {`${formatDate(rate.effectiveFrom)} dan`}
                  {rate.initial && (
                    <Badge variant="secondary" className="ml-2">
                      Boshlang'ich
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">{formatDate(rate.changedOn)}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{formatRate(rate.ratePercent)}</TableCell>
                <TableCell>
                  {rate.initial ? (
                    <Button
                      variant="ghost"
                      size="icon-lg"
                      aria-label="Boshlang'ich stavkani tuzatish"
                      onClick={() => setDialog({ open: true, initial: rate })}
                    >
                      <Pencil aria-hidden="true" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon-lg"
                      className="text-destructive hover:text-destructive"
                      aria-label={`O'chirish: ${describe(rate)}`}
                      onClick={() => setDeleting(rate)}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {dialog.open && (
        <RateDialog
          key={dialog.initial?.id ?? 'new'}
          contract={contract}
          initial={dialog.initial}
          open
          onOpenChange={(open) => !open && setDialog({ open: false })}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stavka o'zgarishini o'chirasizmi?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && `${describe(deleting)}. Shu sanadan keyingi foiz qayta hisoblanadi.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                deleting &&
                remove.mutate(deleting.id, {
                  onSuccess: () => toast.success("Stavka o'zgarishi o'chirildi"),
                  onError: (error) => toast.error(error.message),
                })
              }
            >
              O'chirish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
