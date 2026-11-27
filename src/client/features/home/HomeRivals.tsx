import { Link } from '@tanstack/react-router'
import type { ServiceRecord } from '../../../core/serviceRecord'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { SectionHeading } from '../../components/SectionHeading'
import { nameColour } from '../../playerName'
import { countLabel } from '../../text'

export type Rival = ServiceRecord['opponents'][number]

/** How many opponents the panel names; the profile breaks down every one. */
const SHOWN = 3

/** The players this one has faced most, and how it stands between them; each opens the player's record against that one. */
export function HomeRivals({ userId, rivals }: { userId: string; rivals: readonly Rival[] }) {
  if (!rivals.length) return null
  return (
    <section data-home-rivals>
      <SectionHeading title="Your opponents" />
      <ul className="divide-y divide-edge border-y border-edge">
        {rivals.slice(0, SHOWN).map((rival) => (
          <li key={rival.id}>
            <Link
              to="/users/$userId"
              params={{ userId }}
              search={{ opponentId: rival.id }}
              className="group flex min-h-14 min-w-0 items-center gap-2.5 px-2 py-2.5 transition-colors hover:bg-raised"
            >
              <PlayerAvatar name={rival.name} image={rival.image} className="size-7 shrink-0 text-3xs" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.9375rem] leading-tight font-bold group-hover:underline" style={nameColour(rival)}>
                  {rival.name}
                </span>
                <span className="mt-0.5 block text-2xs text-faint">
                  {countLabel(rival.battles, 'game')}
                  {rival.drawn ? ` · ${countLabel(rival.drawn, 'draw')}` : ''}
                </span>
              </span>
              <span className="figure shrink-0 text-2xl leading-none whitespace-nowrap" aria-label={record(rival)}>
                <span className={rival.won < rival.lost ? 'text-dim' : 'text-achieved'}>{rival.won}</span>
                <span className="px-1 text-faint">–</span>
                <span className={rival.lost < rival.won ? 'text-dim' : 'text-rust'}>{rival.lost}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

const record = (rival: Rival) =>
  `${countLabel(rival.won, 'win')}, ${countLabel(rival.lost, 'loss', 'losses')}${rival.drawn ? `, ${countLabel(rival.drawn, 'draw')}` : ''}`
