import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { buttonClass } from '../../components/buttonClass'

/**
 * The reference a visitor can read right now, without a list or an account. A signed-in player is not shown this,
 * because its links are already in their navigation.
 */
export function HomeIntro() {
  return (
    <section className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div>
        <h2 className="text-2xl leading-none sm:text-3xl">Read the datasheets</h2>
        <p className="mt-3 font-rules text-dim">Units, points and detachments for every faction.</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-3">
        <Link to="/factions" className={buttonClass({ variant: 'outline' })}>
          Browse factions
        </Link>
        <Link to="/docs" className="inline-flex items-center gap-1 text-sm font-semibold text-bone/85 hover:text-parchment">
          <span>Read the docs</span>
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>
    </section>
  )
}
