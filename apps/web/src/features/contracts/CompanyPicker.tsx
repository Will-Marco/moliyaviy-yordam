import { Check, ChevronsUpDown } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Company } from '@/features/companies/api'
import { cn } from '@/lib/utils'

interface Props {
  id: string
  value: string
  onChange: (id: string) => void
  companies: Company[]
  invalid?: boolean
  describedBy?: string
}

/** Searchable company select — by name or STIR. */
export function CompanyPicker({ id, value, onChange, companies, invalid, describedBy }: Props) {
  const [open, setOpen] = useState(false)
  const selected = companies.find((c) => c.id === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className="h-9 w-full justify-between font-normal"
        >
          {selected ? (
            <span className="truncate">
              {selected.name} <span className="text-muted-foreground font-mono text-xs">{selected.tin}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">Firma tanlang</span>
          )}
          <ChevronsUpDown className="text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder="Nomi yoki STIR" />
          <CommandList>
            <CommandEmpty>Topilmadi</CommandEmpty>
            <CommandGroup>
              {companies.map((company) => (
                <CommandItem
                  key={company.id}
                  value={`${company.name} ${company.tin}`}
                  onSelect={() => {
                    onChange(company.id)
                    setOpen(false)
                  }}
                >
                  <Check className={cn(company.id === value ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
                  <span className="truncate">{company.name}</span>
                  <span className="text-muted-foreground ml-auto font-mono text-xs">{company.tin}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
