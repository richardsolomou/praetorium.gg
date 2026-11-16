import { Link } from '@tanstack/react-router'
import { Check, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { SectionHeading } from '../../components/SectionHeading'

/**
 * The three things that make Praetorium worth coming back to, for a player who has not finished a battle yet: a list,
 * a first game and a group to play it with. Each step is ticked by what the player has actually done.
 */
export function HomeGetStarted({ hasRoster, inGroup, newBattle }: { hasRoster: boolean; inGroup: boolean; newBattle?: ReactNode }) {
  return (
    <section data-home-get-started>
      <SectionHeading title="Get started" />
      <ol className="part divide-y divide-edge overflow-hidden">
        <Step done={hasRoster} title="Build a roster" detail="From the army data, or import one from another app.">
          <Link to="/rosters/new" className={STEP_LINK}>
            Build <ChevronRight className="size-4" aria-hidden />
          </Link>
        </Step>
        <Step done={false} title="Play a battle" detail="Against a friend at the table, or a practice opponent.">
          {newBattle}
        </Step>
        <Step done={inGroup} title="Join a group" detail="Keep a leaderboard and a league with the people you play.">
          <Link to="/groups" className={STEP_LINK}>
            Groups <ChevronRight className="size-4" aria-hidden />
          </Link>
        </Step>
      </ol>
    </section>
  )
}

const STEP_LINK = 'inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-bone/85 hover:text-parchment'

function Step({ done, title, detail, children }: { done: boolean; title: string; detail: string; children: ReactNode }) {
  return (
    <li data-done={done || undefined} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
      <span
        aria-hidden
        className="grid size-6 shrink-0 place-items-center rounded-full border border-runner text-faint in-data-done:border-achieved in-data-done:text-achieved"
      >
        {done ? <Check className="size-3.5" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-bone in-data-done:font-normal in-data-done:text-dim in-data-done:line-through">
          {title}
          {done ? <span className="sr-only"> (done)</span> : null}
        </span>
        <span className="block text-xs text-dim">{detail}</span>
      </span>
      {done ? null : children}
    </li>
  )
}
