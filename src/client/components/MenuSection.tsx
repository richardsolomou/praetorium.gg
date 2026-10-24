import type { ReactNode } from 'react'
import { DropdownMenuGroup, DropdownMenuLabel } from '@/components/ui/dropdown-menu'

/** The look shared by the app's action menus: small uppercase labels with icons sized to match. */
export const MENU_ITEM = "text-xs font-semibold uppercase [&_svg:not([class*='size-'])]:size-3.5"

/** A titled group of menu items, so a long menu reads by what each part is for. */
export function MenuSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel className="eyebrow text-faint">{label}</DropdownMenuLabel>
      {children}
    </DropdownMenuGroup>
  )
}
