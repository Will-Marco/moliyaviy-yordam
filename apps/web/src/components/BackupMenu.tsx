import { useQuery } from '@tanstack/react-query'
import { DatabaseBackup, FolderOpen } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useDesktop } from '@/lib/desktop'
import { formatInstantDateTime } from '@/lib/format'

/** Desktop only: when the local database was last backed up, and the folder (restore is by hand — runbook). */
export function BackupMenu() {
  const desktop = useDesktop()
  const status = useQuery({
    queryKey: ['backups'],
    queryFn: () => desktop!.backups.status(),
    enabled: !!desktop,
  })
  if (!desktop) return null

  return (
    <Popover onOpenChange={(open) => open && void status.refetch()}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-9">
          <DatabaseBackup aria-hidden="true" />
          <span className="hidden sm:inline">Zaxira</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-72 gap-3 text-sm">
        <p className="font-medium tabular-nums">
          {status.data?.last ? `Oxirgi zaxira: ${formatInstantDateTime(status.data.last)}` : 'Hali zaxira olinmagan'}
        </p>
        <p className="text-muted-foreground text-xs">
          Ilova har kuni bazadan avtomatik nusxa oladi: oxirgi 14 kun va har oydan bittasi (1 yil) saqlanadi.
        </p>
        <Button variant="outline" className="h-9" onClick={() => desktop.backups.openFolder().catch(() => toast.error("Zaxira papkasini ochib bo'lmadi"))}>
          <FolderOpen aria-hidden="true" />
          Zaxira papkasini ochish
        </Button>
      </PopoverContent>
    </Popover>
  )
}
