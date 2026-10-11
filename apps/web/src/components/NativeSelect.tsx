import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/** A plain <select> styled like the inputs — accessible and keyboard-friendly out of the box. */
export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3',
        className,
      )}
      {...props}
    />
  )
}
