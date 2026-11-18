import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { meQuery } from '../../queries'

/**
 * The offer at the end of a reference page, for a reader who has read to the bottom: one action, and maybe a few
 * other places to go next. A visitor is told the action needs no account.
 */
export function NextStep({
  title,
  description,
  action,
  links,
}: {
  title: string
  description: string
  action: ReactNode
  links?: ReactNode
}) {
  const { data: me } = useQuery(meQuery())
  return (
    <section className="part flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <h2 className="text-lg">{title}</h2>
        <p className="text-sm text-dim">{me ? description : `${description} No account needed.`}</p>
        {links ? <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">{links}</div> : null}
      </div>
      {action}
    </section>
  )
}
