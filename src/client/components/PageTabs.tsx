import { type ComponentProps, type ReactNode, useEffect, useRef } from 'react'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'

// A scroller clips at its padding box, so the runner is painted inside it with room below for the gate's notch.
const RAIL =
  'no-scrollbar -mb-[5px] flex gap-1 overflow-x-auto bg-[linear-gradient(var(--color-runner),var(--color-runner))] bg-size-[100%_2px] bg-position-[0_calc(100%-3px)] bg-no-repeat pb-[5px]'

// The active tab is gated onto the runner baseline: a cement stretch of the rail with a notch below it.
const GATE =
  'after:absolute after:inset-x-2 after:-bottom-0.5 after:h-0.5 after:animate-draw after:bg-parchment before:absolute before:-bottom-[5px] before:left-1/2 before:-ml-1 before:h-1.5 before:w-2 before:rounded-[2px] before:bg-parchment'

/** Keeps the current tab of a scrolling rail in view, on arrival and whenever the current tab changes. */
function useActiveTabInView<T extends HTMLElement>() {
  const rail = useRef<T>(null)
  useEffect(() => {
    const element = rail.current
    if (!element) return
    const reveal = () => {
      const active = element.querySelector('[aria-current="page"], [aria-selected="true"]')
      if (!active) return
      const tab = active.getBoundingClientRect()
      const box = element.getBoundingClientRect()
      element.scrollLeft += tab.left - box.left - (box.width - tab.width) / 2
    }
    reveal()
    const observer = new MutationObserver(reveal)
    observer.observe(element, { subtree: true, attributeFilter: ['aria-current', 'aria-selected'] })
    return () => observer.disconnect()
  }, [])
  return rail
}

/** A page's tab bar on a runner baseline, each tab with an optional count beside its label. */
export function PageTabsList({
  tabs,
  ...props
}: { tabs: readonly { value: string; label: string; count?: number }[] } & Omit<ComponentProps<typeof TabsList>, 'children'>) {
  const rail = useActiveTabInView<HTMLDivElement>()
  return (
    <TabsList ref={rail} variant="line" className={`h-auto w-full justify-start p-0 ${RAIL}`} {...props}>
      {/* The primitive's underline variants key on an orientation attribute this setup never sets, so the gate is placed here. */}
      {tabs.map(({ value, label, count }) => (
        <TabsTrigger
          key={value}
          value={value}
          className="h-11 flex-none gap-2 rounded-none px-3.5 text-[0.9375rem] font-semibold text-dim after:inset-x-2 after:-bottom-0.5 after:h-0.5 after:bg-parchment hover:text-bone data-active:text-bone data-active:after:animate-draw data-active:after:opacity-100 data-active:before:absolute data-active:before:-bottom-[5px] data-active:before:left-1/2 data-active:before:-ml-1 data-active:before:h-1.5 data-active:before:w-2 data-active:before:rounded-[2px] data-active:before:bg-parchment"
        >
          {label}
          {count === undefined ? null : <span className="readout text-xs font-bold text-faint">{count}</span>}
        </TabsTrigger>
      ))}
    </TabsList>
  )
}

/** Tabs that are destinations: links in a nav, drawn like `PageTabsList`, the current one marked with `aria-current="page"`. */
export function PageLinkTabs({ label, children }: { label: string; children: ReactNode }) {
  const rail = useActiveTabInView<HTMLElement>()
  return (
    <nav ref={rail} aria-label={label} className={RAIL}>
      {children}
    </nav>
  )
}

export const pageLinkTabClass = (current: boolean) =>
  `relative flex h-11 shrink-0 items-center gap-2 px-3.5 text-[0.9375rem] font-semibold hover:text-bone ${current ? `text-bone ${GATE}` : 'text-dim'}`
