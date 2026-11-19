import type { ReactNode } from 'react'

/** One labelled figure in the row of facts under a page's title, such as a player's form or leaderboard place. */
export function HeaderFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex flex-col gap-1.5 rounded-lg border border-edge bg-sunken/60 px-3 py-2">
      <span className="eyebrow text-faint">{label}</span>
      {children}
    </span>
  )
}
