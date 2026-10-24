import type { ReactNode } from 'react'
import { DropdownMenuGroup, DropdownMenuLabel } from '@/components/ui/dropdown-menu'

/** A titled group of menu items, so a long menu reads by what each part is for. */
export function MenuSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel className="eyebrow text-faint">{label}</DropdownMenuLabel>
      {children}
    </DropdownMenuGroup>
  )
}
