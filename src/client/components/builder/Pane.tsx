import { X } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'

type Props = {
  variant: 'picker' | 'loadout'
  open: boolean
  title: string
  onClose: () => void
  actions?: ReactNode
  children: ReactNode
  drawer?: boolean
  threeColumn?: boolean
  hideBelowDesktop?: boolean
}

/** One pane moves between sidebar and overlay so controls and labels stay unique. */
const VARIANTS = {
  // Written out rather than composed: Tailwind only sees class names it can read.
  picker:
    'min-[1300px]:static min-[1300px]:z-auto min-[1300px]:inset-auto min-[1300px]:flex min-[1300px]:min-w-0 min-[1300px]:!w-full min-[1300px]:shrink-0 min-[1300px]:border-r min-[1300px]:border-l-0',
  loadout: 'md:static md:z-auto md:inset-auto md:flex md:w-1/2 md:shrink-0 md:border-l min-[1300px]:min-w-0 min-[1300px]:!w-full',
} as const

const TWO_COLUMN_VARIANTS = {
  ...VARIANTS,
  loadout: 'md:static md:z-auto md:inset-auto md:flex md:w-1/2 md:shrink-0 md:border-l',
} as const

const CLOSERS = { picker: 'min-[1300px]:hidden', loadout: '' } as const
const MOBILE_LAYOUT = {
  picker: 'inset-y-0 left-0 w-[min(24rem,calc(100vw-2.5rem))] shadow-2xl',
  loadout: 'inset-0',
} as const

export function Pane({
  variant,
  open,
  title,
  onClose,
  actions,
  children,
  drawer = false,
  threeColumn = true,
  hideBelowDesktop = false,
}: Props) {
  useEffect(() => {
    if (!open) return
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [open, onClose])

  const body = (
    <>
      <div
        className={`relative flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-edge px-3 py-2 ${
          variant === 'loadout' ? 'pr-10 md:pr-3' : 'pr-10'
        } ${CLOSERS[variant]}`}
      >
        {drawer ? (
          <DrawerTitle className="min-w-max flex-1 text-base">{title}</DrawerTitle>
        ) : (
          <h2 className="min-w-max flex-1 text-base">{title}</h2>
        )}
        {actions ? (
          <div data-pane-actions className="flex shrink-0 flex-wrap items-center justify-start gap-1">
            {actions}
          </div>
        ) : null}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close"
          className={`absolute top-2 right-3 ${variant === 'loadout' ? 'md:hidden' : ''}`}
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </>
  )

  if (drawer) {
    return (
      <Drawer open={open} onOpenChange={(next) => !next && onClose()} swipeDirection="left" showSwipeHandle>
        <DrawerContent
          className="border-edge bg-panel p-0 text-bone"
          style={{ '--drawer-content-width': 'min(32rem, calc(100vw - 1rem))' } as CSSProperties}
        >
          {body}
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <aside
      data-print-hide
      data-pane={variant}
      className={`min-h-0 flex-col overflow-hidden border-edge bg-panel [container-type:inline-size] ${(threeColumn ? VARIANTS : TWO_COLUMN_VARIANTS)[variant]} ${
        hideBelowDesktop ? 'max-[1299px]:hidden' : ''
      } ${open ? `fixed z-40 flex ${MOBILE_LAYOUT[variant]}` : 'hidden'}`}
      aria-label={title}
    >
      {body}
    </aside>
  )
}
