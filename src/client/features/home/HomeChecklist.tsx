import { Link } from '@tanstack/react-router'
import { Check, ChevronRight } from 'lucide-react'
import type { OnboardingProgress } from '../../../core/onboarding'
import { onboardingTasks } from '../onboarding/onboarding'

/** The tasks the account's own data completes, each with the page where it is done. */
const STEPS = [
  { id: 'roster', to: '/rosters/new' },
  { id: 'friend', to: '/friends' },
  { id: 'battle', to: '/battles' },
  { id: 'league', to: '/leagues' },
] as const

/**
 * Whether a player is still finding their way in: no list built and no battle played.
 * Many players only build lists, so a first list is as much a start as a first game.
 */
export function settingUp(progress: OnboardingProgress | undefined) {
  return Boolean(
    progress &&
    !progress.completedTasks.includes('roster') &&
    !progress.completedTasks.includes('battle') &&
    !progress.skippedTasks.includes('battle'),
  )
}

/**
 * The way in for a new account, with what is already done ticked.
 *
 * Progress is the same fold the Getting started guide in the account menu reads,
 * so the two cannot disagree.
 */
export function HomeChecklist({ progress }: { progress: OnboardingProgress }) {
  return (
    <section data-home-checklist>
      <p className="rubric border-b border-edge pb-2">Getting started</p>
      <ol className="divide-y divide-edge border-b border-edge">
        {STEPS.map(({ id, to }) => {
          const task = onboardingTasks.find((candidate) => candidate.id === id)!
          const done = progress.completedTasks.includes(id)
          return (
            <li key={id}>
              <Link to={to} className="group -mx-3 flex items-start gap-3 px-3 py-3 hover:bg-raised">
                <span
                  className={`mt-0.5 grid size-5 shrink-0 place-items-center border ${done ? 'border-achieved bg-achieved/15 text-achieved' : 'border-edge-strong'}`}
                >
                  {done ? <Check className="size-3.5" aria-label="Done" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-bold uppercase ${done ? 'text-dim line-through' : ''}`}>{task.title}</span>
                  {done ? null : <span className="mt-1 block font-rules text-sm text-dim">{task.description}</span>}
                </span>
                <ChevronRight className="mt-0.5 size-4 shrink-0 text-info group-hover:text-parchment" aria-hidden />
              </Link>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
