import { Link } from '@tanstack/react-router'
import { BookOpen, ChevronRight, Map as MapIcon, Shield } from 'lucide-react'

const TOOLS = [
  {
    icon: Shield,
    title: 'Read the datasheets',
    text: 'Units, points and detachments for every faction.',
    link: '/factions' as const,
    action: 'Browse factions',
  },
  {
    icon: MapIcon,
    title: 'Choose a mission',
    text: 'Packs, deployments, objectives and scoring.',
    link: '/missions' as const,
    action: 'Explore missions',
  },
  {
    icon: BookOpen,
    title: 'Look up a rule',
    text: 'The core rules, by section and number.',
    link: '/rules' as const,
    action: 'Read the rules',
  },
]

/**
 * The reference a visitor can read right now, without a list or an account. Rows rather than a grid of matching
 * cards: each is a door, and a door is read by its name. A signed-in player is not shown this, because every link in
 * it is already in their navigation.
 */
export function HomeIntro() {
  return (
    <section>
      <h2 className="text-2xl leading-none sm:text-3xl">Look something up</h2>
      <ul className="runner mt-5 max-w-3xl [--gate-y:1.625rem]">
        {TOOLS.map(({ icon: Icon, title: name, text, link, action }) => (
          <li key={name} className="min-w-0 border-b border-edge last:border-0">
            <Link
              to={link}
              aria-label={`${name}: ${action}`}
              className="group -mr-3 flex items-center gap-4 rounded-lg py-3.5 pr-3 pl-2 transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-parchment"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 leading-tight font-bold">
                  <Icon className="size-4 shrink-0 text-dim group-hover:text-bone" aria-hidden />
                  {name}
                </span>
                <span className="mt-1 block font-rules text-sm text-dim">{text}</span>
              </span>
              <ChevronRight
                className="size-5 shrink-0 text-dim transition-transform group-hover:translate-x-0.5 group-hover:text-parchment"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
      <Link to="/docs" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-bone/85 hover:text-parchment">
        Read the docs <ChevronRight className="size-4" aria-hidden />
      </Link>
    </section>
  )
}
