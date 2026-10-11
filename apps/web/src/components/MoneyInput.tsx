import type { ComponentProps } from 'react'
import { Input } from '@/components/ui/input'
import { caretAfterFormat, formatMoneyTyping } from '@/lib/format'
import { cn } from '@/lib/utils'

const NBSP = '\u00a0'

/** FR-10.1: an amount field that groups thousands as the accountant types ("2000000" → "2 000 000"). */
export function MoneyInput({ className, onChange, onKeyDown, ...props }: ComponentProps<typeof Input>) {
  return (
    <Input
      inputMode="decimal"
      autoComplete="off"
      className={cn('font-mono tabular-nums', className)}
      {...props}
      onKeyDown={(event) => {
        // A thousands space is re-added by formatting, so Delete/Backspace step over it and remove the digit.
        const input = event.currentTarget
        const at = input.selectionStart
        if (at !== null && at === input.selectionEnd) {
          if (event.key === 'Delete' && input.value[at] === NBSP) input.setSelectionRange(at + 1, at + 1)
          if (event.key === 'Backspace' && input.value[at - 1] === NBSP) input.setSelectionRange(at - 1, at - 1)
        }
        onKeyDown?.(event)
      }}
      onChange={(event) => {
        const input = event.target
        const before = input.value
        const formatted = formatMoneyTyping(before)
        if (formatted !== before) {
          const caret = caretAfterFormat(before, input.selectionStart ?? before.length, formatted)
          input.value = formatted
          input.setSelectionRange(caret, caret)
        }
        onChange?.(event)
      }}
    />
  )
}
