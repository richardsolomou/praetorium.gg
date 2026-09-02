import { Link } from '@tanstack/react-router'
import { BookOpen, ChevronRight, Code, ListChecks, Swords } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'

/** The repository, which is the product's other front door. */
const SOURCE = 'https://github.com/richardsolomou/praetorium.gg'

const CAPABILITIES = [
  {
    icon: ListChecks,
    title: 'Build your army',
    text: 'Choose your faction, units and loadouts. Points and list checks update as you build.',
    link: '/rosters' as const,
    action: 'Build an army',
  },
  {
    icon: BookOpen,
    title: 'Choose a mission',
    text: 'Explore mission packs, deployments, terrain layouts, objectives and scoring before the game starts.',
    link: '/mission-packs' as const,
    action: 'Explore missions',
  },
  {
    icon: Swords,
    title: 'Track the battle',
    text: 'Play 1v1, 2v1 or 2v2 with friends, or practise on your own. Keep track of turns, command points, scoring and casualties.',
    link: '/battles' as const,
    action: 'View battles',
  },
]

/**
 * What the app does, and where the code is — for a visitor only.
 *
 * A signed-in player with anything on their home page is not shown any of this.
 * Every link in it is already in the navigation above them, so under their own
 * live games it would be a second copy of the menu wearing a pitch.
 *
 * Both blocks use the same hairline grid, so the page has one way of laying a
 * small set of boxes out rather than one per section.
 */
export function HomeIntro() {
  return (
    <>
      <section>
        <p className="rubric border-b border-edge pb-2">Build. Plan. Play.</p>
        <div className="mt-2 grid gap-px border border-edge bg-edge sm:grid-cols-3">
          {CAPABILITIES.map(({ icon: Icon, title, text, link, action }) => (
            <article key={title} className="min-w-0 bg-panel">
              <Link
                to={link}
                className="group block h-full p-4 transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-info"
              >
                <Icon className="size-5 text-parchment" aria-hidden />
                <h2 className="mt-4 text-lg">{title}</h2>
                <p className="mt-2 min-h-16 text-sm text-dim">{text}</p>
                <span className="eyebrow mt-4 inline-flex items-center gap-1 text-info group-hover:text-parchment">
                  {action} <ChevronRight className="size-3.5" aria-hidden />
                </span>
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section>
        <p className="rubric border-b border-edge pb-2">Built in the open</p>
        <div className="mt-2 flex flex-col gap-4 border border-edge bg-panel p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-dim">
            Praetorium is free to use and open source. Anyone can read the code, report a problem or contribute.
          </p>
          <a
            href={SOURCE}
            className={buttonVariants({ variant: 'outline', className: 'shrink-0' })}
            rel="noreferrer noopener"
            target="_blank"
          >
            <Code /> View the source
          </a>
        </div>
      </section>
    </>
  )
}
