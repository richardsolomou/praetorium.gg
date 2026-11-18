import { ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { HOBBYKIT } from '../projectLinks'
import { buttonClass } from './buttonClass'

/** HobbyKit is a free, open-source generator by the same maker; `links` are paths or `#base=` hashes on it. */
export function HobbyKitCard({
  title,
  description,
  links,
  primary = false,
  className,
}: {
  title: ReactNode
  description: string
  links: { label: string; to: string }[]
  primary?: boolean
  className?: string
}) {
  return (
    <div className={`flex flex-col gap-4 part p-4 sm:flex-row sm:items-center ${className ?? ''}`}>
      <img src="/hobbykit.svg" alt="" className="size-12 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-lg leading-tight text-bone">{title}</p>
        <p className="text-sm text-dim">{description}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {links.map(({ label, to }) => (
          <a
            key={to}
            href={`${HOBBYKIT}${to}`}
            target="_blank"
            rel="noopener"
            className={buttonClass({ variant: primary ? 'default' : 'outline', className: 'shrink-0' })}
          >
            {label}
            <ArrowUpRight aria-hidden />
          </a>
        ))}
      </div>
    </div>
  )
}
