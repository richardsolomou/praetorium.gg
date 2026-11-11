import type { ComponentProps, ReactNode } from 'react'
import { ContextMenuItem as UiContextMenuItem } from '@/components/ui/context-menu'
import {
  DropdownMenuCheckboxItem as UiDropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuItem as UiDropdownMenuItem,
  DropdownMenuLabel as UiDropdownMenuLabel,
  DropdownMenuRadioItem as UiDropdownMenuRadioItem,
  DropdownMenuSubTrigger as UiDropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

/** Every menu row in the app, dropdown or right-click, shares this size and spacing so menus read alike. */
const ROW = 'gap-2 px-2'
const CHECK_ROW = 'gap-2 pl-2'

export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof UiDropdownMenuItem>) {
  return <UiDropdownMenuItem className={cn(ROW, className)} {...props} />
}

export function ContextMenuItem({ className, ...props }: ComponentProps<typeof UiContextMenuItem>) {
  return <UiContextMenuItem className={cn(ROW, className)} {...props} />
}

export function DropdownMenuSubTrigger({ className, ...props }: ComponentProps<typeof UiDropdownMenuSubTrigger>) {
  return <UiDropdownMenuSubTrigger className={cn(ROW, className)} {...props} />
}

export function DropdownMenuCheckboxItem({ className, ...props }: ComponentProps<typeof UiDropdownMenuCheckboxItem>) {
  return <UiDropdownMenuCheckboxItem className={cn(CHECK_ROW, className)} {...props} />
}

export function DropdownMenuRadioItem({ className, ...props }: ComponentProps<typeof UiDropdownMenuRadioItem>) {
  return <UiDropdownMenuRadioItem className={cn(CHECK_ROW, className)} {...props} />
}

/** A group's name inside a menu, lined up with the rows below it. */
export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof UiDropdownMenuLabel>) {
  return <UiDropdownMenuLabel className={cn('eyebrow px-2 text-faint', className)} {...props} />
}

/** A titled group of menu items, so a long menu reads by what each part is for; the heading divides it from the group above, so no separator goes between them. */
export function MenuSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <DropdownMenuGroup className="not-first:mt-1.5">
      <DropdownMenuLabel>{label}</DropdownMenuLabel>
      {children}
    </DropdownMenuGroup>
  )
}
