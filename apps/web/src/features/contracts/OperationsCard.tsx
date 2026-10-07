import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
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
import { Card, CardAction, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate, formatMoney, isNegativeMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Contract } from './api'
import { type Operation, OPERATION_TYPES, useDeleteOperation, useOperations } from './operations-api'
import { OperationFormDialog } from './OperationFormDialog'

type FormState = { open: false } | { open: true; operation?: Operation }

const typeLabel = (op: Operation) => OPERATION_TYPES.find((t) => t.value === op.type)!.long
const label = (op: Operation) => `${formatDate(op.date)}, ${formatMoney(op.amount)}`

/** FR-3.4: one ledger row per operation, amounts in the column of their type, running principal balance. */
export function OperationsCard({ contract }: { contract: Contract }) {
  const operations = useOperations(contract.id)
  const remove = useDeleteOperation(contract.id)
  const [form, setForm] = useState<FormState>({ open: false })
  const [deleting, setDeleting] = useState<Operation | null>(null)

  const amountIn = (op: Operation, type: Operation['type']) =>
    op.type === type ? formatMoney(op.amount) : <span className="text-muted-foreground">—</span>

  return (
    <Card className="gap-0 p-0">
      <CardHeader className="p-4">
        <CardTitle className="text-base">Operatsiyalar</CardTitle>
        <CardAction>
          <Button className="h-9" onClick={() => setForm({ open: true })}>
            <Plus aria-hidden="true" />
            Operatsiya qo'shish
          </Button>
        </CardAction>
      </CardHeader>

      {operations.error ? (
        <div className="p-4 pt-0">
          <QueryErrorState error={operations.error} onRetry={() => operations.refetch()} />
        </div>
      ) : operations.isPending ? (
        <p className="text-muted-foreground p-6 text-center text-sm" aria-busy="true">
          Yuklanmoqda…
        </p>
      ) : operations.data.length === 0 ? (
        <p className="text-muted-foreground border-t p-6 text-center text-sm">
          Hali operatsiya yo'q. Birinchi berilgan summani kiriting.
        </p>
      ) : (
        <div className="overflow-x-auto border-t">
          <Table aria-label="Operatsiyalar">
            <TableHeader>
              <TableRow>
                <TableHead>Sana</TableHead>
                <TableHead className="text-right">Berildi</TableHead>
                <TableHead className="text-right">Qaytarildi</TableHead>
                <TableHead className="text-right">Foiz to'landi</TableHead>
                <TableHead className="text-right">Qoldiq</TableHead>
                <TableHead>Izoh</TableHead>
                <TableHead className="w-24">
                  <span className="sr-only">Amallar</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {operations.data.map((op) => (
                <TableRow key={op.id} className={cn(op.scheduled && 'text-muted-foreground')}>
                  <TableCell className="whitespace-nowrap tabular-nums" title={typeLabel(op)}>
                    {formatDate(op.date)}
                    {op.scheduled && (
                      <Badge variant="outline" className="ml-2" title="Sanasi kelganda hisobga kiradi">
                        Rejalashtirilgan
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{amountIn(op, 'DISBURSEMENT')}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{amountIn(op, 'PRINCIPAL_REPAYMENT')}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{amountIn(op, 'INTEREST_PAYMENT')}</TableCell>
                  <TableCell
                    className={cn(
                      'text-right font-mono font-medium tabular-nums',
                      isNegativeMoney(op.balanceAfter) && 'text-destructive',
                    )}
                  >
                    {formatMoney(op.balanceAfter)}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-56 truncate" title={op.note ?? undefined}>
                    {op.note}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="icon-lg"
                      aria-label={`Tahrirlash: ${label(op)}`}
                      onClick={() => setForm({ open: true, operation: op })}
                    >
                      <Pencil aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-lg"
                      className="text-destructive hover:text-destructive"
                      aria-label={`O'chirish: ${label(op)}`}
                      onClick={() => setDeleting(op)}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {form.open && (
        <OperationFormDialog
          key={form.operation?.id ?? 'new'}
          contract={contract}
          operation={form.operation}
          open
          onOpenChange={(open) => !open && setForm({ open: false })}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Operatsiyani o'chirasizmi?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && `${typeLabel(deleting)}: ${label(deleting)}. Qoldiq va foiz qayta hisoblanadi.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                deleting &&
                remove.mutate(deleting.id, {
                  onSuccess: () => toast.success("Operatsiya o'chirildi"),
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
