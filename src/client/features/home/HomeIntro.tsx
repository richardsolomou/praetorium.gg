import { Link } from '@tanstack/react-router'
import { BookOpen, ChevronRight, Crosshair, Map as MapIcon, Shield } from 'lucide-react'

const TOOLS = [
  {
    icon: Crosshair,
    title: 'Simulate a fight',
    text: 'Shooting and melee odds for any matchup.',
    link: '/simulator' as const,
    action: 'Open the simulator',
  },
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
    link: '/mission-packs' as const,
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
 * What can be used right now, before a list is built or a game is started.
 *
 * Every tool here works without an account, so a visitor is offered something to
 * do rather than only something to sign up for. Rows rather than a grid of
 * matching cards: each is a door, and a door is read by its name. A signed-in
 * player with anything on their home page is not shown this, because every link
 * in it is already in their navigation.
 */
export function HomeIntro({ title }: { title: string }) {
  return (
    <section>
      <h2 className="text-2xl leading-none sm:text-3xl">{title}</h2>
      <ul className="mt-6 grid border-t border-edge lg:grid-cols-2 lg:gap-x-10">
        {TOOLS.map(({ icon: Icon, title: name, text, link, action }) => (
          <li key={name} className="min-w-0 border-b border-edge">
            <Link
              to={link}
              aria-label={`${name}: ${action}`}
              className="group -mx-3 flex items-start gap-4 px-3 py-4 transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-info"
            >
              <Icon className="mt-0.5 size-6 shrink-0 text-parchment" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block leading-tight font-bold uppercase">{name}</span>
                <span className="mt-1 block font-rules text-sm text-dim">{text}</span>
              </span>
              <ChevronRight
                className="mt-1 size-5 shrink-0 text-info transition-transform group-hover:translate-x-0.5 group-hover:text-parchment"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
