import type { ComponentProps } from 'react'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'

// The active tab is gated onto the runner baseline: a cement stretch of the rail with a notch below it.
const GATE =
  'after:absolute after:inset-x-2 after:-bottom-0.5 after:h-0.5 after:animate-draw after:bg-parchment before:absolute before:-bottom-[5px] before:left-1/2 before:-ml-1 before:h-1.5 before:w-2 before:rounded-[2px] before:bg-parchment'

/** A page's tab bar on a runner baseline, each tab with an optional count beside its label. */
export function PageTabsList({
  tabs,
  ...props
}: { tabs: readonly { value: string; label: string; count?: number }[] } & Omit<ComponentProps<typeof TabsList>, 'children'>) {
  return (
    <TabsList variant="line" className="h-auto w-full flex-wrap justify-start gap-1 border-b-2 border-runner p-0" {...props}>
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

/** Tabs that are destinations: links in a nav, drawn like `PageTabsList`. */
export const pageLinkTabsClass = 'flex flex-wrap gap-1 border-b-2 border-runner'

export const pageLinkTabClass = (current: boolean) =>
  `relative flex h-11 items-center gap-2 px-3.5 text-[0.9375rem] font-semibold hover:text-bone ${current ? `text-bone ${GATE}` : 'text-dim'}`
