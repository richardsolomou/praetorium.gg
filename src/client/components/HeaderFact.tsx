import type { ReactNode } from 'react'

/** One labelled figure in the ruled strip of facts under a page's title, such as a player's form or leaderboard place. */
export function HeaderFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex h-full flex-col justify-between gap-1.5 px-4 py-2.5">
      <span className="eyebrow text-faint">{label}</span>
      {children}
    </span>
  )
}
