import type { ReactNode } from 'react'

/** Why a filtered list is empty; the way back is Clear filters in the bar directly above. */
export function NoFilterMatches({ children }: { children: ReactNode }) {
  return <p className="py-2 text-sm text-dim">{children}</p>
}
