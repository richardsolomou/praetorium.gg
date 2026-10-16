import type { ComponentProps } from 'react'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'

/** A page's underlined tab bar, each tab with an optional count beside its label. */
export function PageTabsList({
  tabs,
  ...props
}: { tabs: readonly { value: string; label: string; count?: number }[] } & Omit<ComponentProps<typeof TabsList>, 'children'>) {
  return (
    <TabsList variant="line" className="h-auto w-full justify-start gap-4 border-b border-edge p-0" {...props}>
      {/* The primitive's own active underline renders at no height in this setup, so it is stated here. */}
      {tabs.map(({ value, label, count }) => (
        <TabsTrigger
          key={value}
          value={value}
          className="rubric h-auto flex-none gap-2 rounded-none px-0 pb-2 after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-parchment hover:text-bone data-active:text-parchment data-active:after:opacity-100"
        >
          {label}
          {count === undefined ? null : <span className="readout text-faint">{count}</span>}
        </TabsTrigger>
      ))}
    </TabsList>
  )
}

/** Tabs that are destinations: links in a nav, drawn like `PageTabsList`. */
export const pageLinkTabsClass = 'flex gap-4 border-b border-edge'

export const pageLinkTabClass = (current: boolean) =>
  `rubric relative -mb-px flex min-h-11 items-end border-b-2 pb-2 hover:text-bone ${current ? 'border-parchment text-parchment' : 'border-transparent'}`
