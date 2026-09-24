import { Link } from '@tanstack/react-router'
import { Code } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'

/** The repository, which is the product's other front door. */
export const SOURCE = 'https://github.com/richardsolomou/praetorium.gg'

const STEPS = [
  {
    title: 'Build the list',
    text: 'Points and legality checked as you build. Import from New Recruit or BattleBase.',
  },
  {
    title: 'Set the table',
    text: '1v1, 2v1 or 2v2, or practise alone. Pick the mission, deployment and terrain.',
  },
  {
    title: 'Play on any device',
    text: 'Everyone follows the same game: phases, command points, scoring and casualties.',
  },
  {
    title: 'Look back',
    text: 'Finished games build your record and the leaderboard.',
  },
]

/**
 * How a game runs here, for somebody deciding whether to bring theirs.
 *
 * Drawn as one line with a marker per stage, the diamond the logo stands on,
 * because these are the order a game actually happens in rather than four
 * features that could be read in any order. Each step says what the app does:
 * a visitor reads this before they know the navigation, and "track the battle"
 * promises nothing a paper tally does not.
 */
export function HomeSteps() {
  return (
    <section data-home-steps>
      <h2 className="text-2xl leading-none sm:text-3xl">From list to final score</h2>
      <ol className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0">
        {STEPS.map(({ title, text }, index) => (
          <li key={title} className="min-w-0 lg:pr-8">
            <span className="flex items-center gap-3" aria-hidden>
              <span className="size-2.5 shrink-0 rotate-45 bg-parchment" />
              {index < STEPS.length - 1 ? <span className="hidden h-px flex-1 bg-edge-strong lg:block" /> : null}
            </span>
            <h3 className="mt-4 text-lg leading-tight">{title}</h3>
            <p className="mt-2 max-w-sm font-rules text-sm leading-relaxed text-dim">{text}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

/**
 * The last thing a visitor reads: the hero's invitation again, and the promise behind it.
 *
 * A band the width of the page, like the hero it answers, so the page closes on the
 * same note it opened on. The code being open is what the product offers instead of
 * a subscription, so it is said beside the sign-up rather than in a box of its own.
 */
export function HomeClosing() {
  return (
    <section className="relative overflow-hidden border-t border-edge bg-panel">
      <div className="sheen" />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-3 py-12 sm:px-4 md:flex-row md:items-end md:justify-between md:py-16">
        <div>
          <h2 className="text-3xl leading-[0.9] sm:text-4xl">
            Bring your
            <span className="block text-parchment">next game.</span>
          </h2>
          <p className="mt-5 max-w-md font-rules text-dim">Free to use, and open source.</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link to="/sign-in" search={{ next: undefined }} className={buttonVariants({ size: 'lg' })}>
            Create an account
          </Link>
          <a href={SOURCE} className={buttonVariants({ variant: 'outline', size: 'lg' })} rel="noreferrer noopener" target="_blank">
            <Code /> View the source
          </a>
        </div>
      </div>
    </section>
  )
}
