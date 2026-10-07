import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

/** One click → `value` on the clipboard; `label` names the field for screen readers. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    if (await writeClipboard(value)) setCopied(true)
    else toast.error("Nusxalab bo'lmadi — qo'lda belgilab oling")
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="text-muted-foreground hover:text-foreground shrink-0"
      aria-label={`Nusxalash: ${label}`}
      title="Nusxalash"
      onClick={copy}
    >
      {copied ? <Check className="text-emerald-600" aria-hidden="true" /> : <Copy aria-hidden="true" />}
      <span className="sr-only" aria-live="polite">
        {copied ? 'Nusxalandi' : ''}
      </span>
    </Button>
  )
}

/** Clipboard API needs a secure context and permission; plain HTTP or a strict browser falls back to execCommand. */
async function writeClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    const focused = document.activeElement as HTMLElement | null
    const area = document.createElement('textarea')
    area.value = value
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    try {
      return document.execCommand('copy')
    } finally {
      area.remove()
      focused?.focus()
    }
  }
}
