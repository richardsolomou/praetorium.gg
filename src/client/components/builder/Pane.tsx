import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

type Props = { variant: 'picker' | 'loadout' | 'datasheet'; open: boolean; title: string; onClose: () => void; children: ReactNode }

/**
 * A side pane where there is room for one, the same pane over the roster where
 * there is not.
 *
 * One instance either way. Rendering a sidebar and a sheet with the same contents
 * puts two of every control in the page — two fields labelled "add a unit", both
 * real to a screen reader — so the pane moves rather than being duplicated, which
 * CSS can do and a second copy cannot.
 */
const VARIANTS = {
  // Written out rather than composed: Tailwind only sees class names it can read.
  picker: 'lg:static lg:z-auto lg:inset-auto lg:flex lg:w-1/3 min-[1440px]:!w-1/4 lg:shrink-0 lg:border-r lg:border-l-0',
  loadout: 'lg:static lg:z-auto lg:inset-auto lg:flex lg:w-1/3 min-[1440px]:!w-1/4 lg:shrink-0 lg:border-l',
  datasheet:
    'min-[1440px]:static min-[1440px]:z-auto min-[1440px]:inset-auto min-[1440px]:flex min-[1440px]:w-1/4 min-[1440px]:shrink-0 min-[1440px]:border-l',
} as const

const CLOSERS = { picker: 'lg:hidden', loadout: 'lg:hidden', datasheet: 'min-[1440px]:hidden' } as const

export function Pane({ variant, open, title, onClose, children }: Props) {
  useEffect(() => {
    if (!open) return undefined
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [open, onClose])

  return (
    <aside
      className={`flex-col border-edge bg-panel ${VARIANTS[variant]} ${open ? 'fixed inset-0 z-40 flex' : 'hidden'}`}
      aria-label={title}
    >
      <div className={`flex items-center justify-between border-b border-edge px-3 py-2 ${CLOSERS[variant]}`}>
        <h2 className="text-base">{title}</h2>
        <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </aside>
  )
}
