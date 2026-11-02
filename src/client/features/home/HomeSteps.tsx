import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'

const STEPS = [
  {
    title: 'Build your list',
    text: 'Live points and legality as you add units. Or import a list you already have.',
    link: '/rosters' as const,
    action: 'Open the army builder',
  },
  {
    title: 'Test your matchups',
    text: 'See the odds of any unit shooting or fighting another.',
    link: '/simulator' as const,
    action: 'Open the simulator',
  },
  {
    title: 'Play and keep score',
    text: 'Score, CP, missions and casualties, tracked on both players’ phones.',
    link: '/battles' as const,
    action: 'See the battle tracker',
  },
]

/** What the product is for, in the order a game uses it, for a visitor who has never seen it. */
export function HomeSteps() {
  return (
    <section aria-labelledby="home-steps">
      <h2 id="home-steps" className="text-2xl leading-none sm:text-3xl">
        From list to final score
      </h2>
      <ol className="mt-6 grid gap-4 md:grid-cols-3">
        {STEPS.map(({ title, text, link, action }, at) => (
          <li key={title} className="flex">
            <Link to={link} className="group flex w-full flex-col part p-5 transition-colors hover:border-runner-hi hover:bg-raised">
              <span className="step-number group-hover:text-parchment" aria-hidden>
                {at + 1}
              </span>
              <span className="mt-4 text-lg leading-tight font-bold">{title}</span>
              <span className="mt-2 flex-1 font-rules text-sm leading-relaxed text-dim">{text}</span>
              <span className="mt-4 flex items-center gap-1 text-sm font-semibold text-bone/85 group-hover:text-parchment">
                {action}
                <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}
