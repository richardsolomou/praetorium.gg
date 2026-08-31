import { Link } from '@tanstack/react-router'
import { BookOpen, ChevronRight, Code, ListChecks, Swords } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'

/** The repository, which is the product's other front door. */
const SOURCE = 'https://github.com/richardsolomou/praetorium.gg'

const CAPABILITIES = [
  {
    icon: ListChecks,
    title: 'Build the army',
    text: 'Pick units and loadouts from verified community catalogues. Praetorium prices the list and reports what it cannot check.',
    link: '/rosters' as const,
    action: 'Open rosters',
  },
  {
    icon: Swords,
    title: 'Share the battle',
    text: 'Play 1v1, 2v1 or 2v2 against friends or practice opponents. Every seated phone reads the same log, phase, resources and score.',
    link: '/battles' as const,
    action: 'Open battles',
  },
  {
    icon: BookOpen,
    title: 'Use the mission',
    text: 'Read mission packs, force-disposition matchups, deployment plans, terrain layouts and scoring cards.',
    link: '/mission-packs' as const,
    action: 'View mission packs',
  },
]

/**
 * What the app does, and where the code is — for a visitor only.
 *
 * A signed-in player is not shown any of this. Every link in it is already in the
 * navigation above them, so under their own live games it would be a second copy
 * of the menu wearing a pitch.
 *
 * Both blocks use the same hairline grid, so the page has one way of laying a
 * small set of boxes out rather than one per section.
 */
export function HomeIntro() {
  return (
    <>
      <section>
        <p className="rubric border-b border-edge pb-2">What you get</p>
        <div className="mt-2 grid gap-px border border-edge bg-edge sm:grid-cols-3">
          {CAPABILITIES.map(({ icon: Icon, title, text, link, action }) => (
            <article key={title} className="group min-w-0 bg-panel p-4 transition-colors hover:bg-raised">
              <Icon className="size-5 text-parchment" aria-hidden />
              <h2 className="mt-4 text-lg">{title}</h2>
              <p className="mt-2 min-h-16 text-sm text-dim">{text}</p>
              <Link to={link} className="eyebrow mt-4 inline-flex items-center gap-1 text-info group-hover:text-parchment">
                {action} <ChevronRight className="size-3.5" />
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section>
        <p className="rubric border-b border-edge pb-2">Built in the open</p>
        <div className="mt-2 flex flex-col gap-4 border border-edge bg-panel p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-dim">
            Praetorium is free and open source under the AGPL. Read the code, report a problem, or send a change.
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
