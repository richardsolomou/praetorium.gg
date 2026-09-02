import { ChevronLeft, X } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'

type Props = {
  variant: 'picker' | 'loadout'
  open: boolean
  title: string
  ariaLabel?: string
  backLabel?: string
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
  loadout: 'lg:static lg:z-auto lg:inset-auto lg:flex lg:min-w-0 lg:w-1/2 lg:shrink-0 lg:border-l min-[1300px]:!w-full',
} as const

const TWO_COLUMN_VARIANTS = {
  ...VARIANTS,
  loadout: 'lg:static lg:z-auto lg:inset-auto lg:flex lg:min-w-0 lg:w-1/2 lg:shrink-0 lg:border-l',
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
  ariaLabel,
  backLabel,
  onClose,
  actions,
  children,
  drawer = false,
  threeColumn = true,
  hideBelowDesktop = false,
}: Props) {
  const pane = useRef<HTMLElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef<HTMLElement>(null)
  const [compactLoadout, setCompactLoadout] = useState(false)
  /*
   * A compact loadout is a dialog on the website and a screen in the application,
   * where the tab bar stays beside it. A screen does not take the page hostage:
   * keeping `aria-modal` and a focus trap here would hide tabs a thumb can reach.
   */
  const [screen, setScreen] = useState(false)

  useLayoutEffect(() => {
    if (variant !== 'loadout') return
    const media = window.matchMedia('(max-width: 1023px)')
    const sync = () => {
      setCompactLoadout(media.matches)
      setScreen(media.matches && document.documentElement.dataset.nativeApp === 'true')
    }
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [variant])

  useEffect(() => {
    if (!open) return
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [open, onClose])

  useEffect(() => {
    const active = document.activeElement
    if (open && active instanceof HTMLElement && !pane.current?.contains(active)) returnFocus.current = active
  }, [open])

  useEffect(() => {
    const paneElement = pane.current
    const closeElement = closeButton.current
    if (!open || !compactLoadout || !paneElement) return
    const active = document.activeElement
    if (active instanceof HTMLElement && !paneElement.contains(active)) returnFocus.current = active
    const focusTarget = returnFocus.current
    const backgrounds: Array<{ element: HTMLElement; inert: boolean }> = []
    let branch = paneElement

    while (branch.parentElement) {
      const parent = branch.parentElement
      for (const sibling of parent.children) {
        if (sibling === branch || !(sibling instanceof HTMLElement)) continue
        // The tab bar is the one thing beside this pane that stays on screen.
        if (screen && sibling.hasAttribute('data-native-app-tabs')) continue
        backgrounds.push({ element: sibling, inert: sibling.inert })
        sibling.inert = true
      }
      if (parent === document.body) break
      branch = parent
    }

    const containFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const focusable = [
        ...paneElement.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), [tabindex]:not([tabindex="-1"])'),
      ].filter((element) => element.getClientRects().length > 0)
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) return
      if (event.shiftKey ? document.activeElement === first : document.activeElement === last) {
        event.preventDefault()
        const target = event.shiftKey ? last : first
        target.focus()
      }
    }
    if (!screen) document.addEventListener('keydown', containFocus)
    closeElement?.focus()
    return () => {
      document.removeEventListener('keydown', containFocus)
      for (const background of backgrounds) background.element.inert = background.inert
      if (focusTarget?.isConnected) focusTarget.focus()
    }
  }, [compactLoadout, open, screen])

  const body = (
    <>
      <div
        className={`relative flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-edge px-3 py-2 ${
          variant === 'loadout' ? 'pl-12 lg:pl-3' : 'pr-12'
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
          ref={closeButton}
          variant="ghost"
          size="icon"
          aria-label={variant === 'loadout' ? (backLabel ?? 'Back to roster') : 'Close'}
          className={`absolute top-0.5 ${variant === 'loadout' ? 'left-0 size-11 lg:hidden' : 'right-2'}`}
          onClick={onClose}
        >
          {variant === 'loadout' ? <ChevronLeft className="size-5" /> : <X />}
        </Button>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
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
      ref={pane}
      data-print-hide
      data-pane={variant}
      className={`min-h-0 min-w-0 max-w-full flex-col overflow-hidden overscroll-x-none border-edge bg-panel [container-type:inline-size] ${(threeColumn ? VARIANTS : TWO_COLUMN_VARIANTS)[variant]} ${
        hideBelowDesktop ? 'max-[1299px]:hidden' : ''
      } ${open ? `fixed z-40 flex ${MOBILE_LAYOUT[variant]}` : 'hidden'}`}
      aria-label={ariaLabel ?? title}
      role={open && compactLoadout && !screen ? 'dialog' : undefined}
      aria-modal={(open && compactLoadout && !screen) || undefined}
    >
      {body}
    </aside>
  )
}
