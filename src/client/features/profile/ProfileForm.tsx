import { Link } from '@tanstack/react-router'
import { battleOutcome, type StandingFaction } from '../../../core/standings'
import { FactionMark, type FactionPresentation } from '../../components/FactionMark'
import type { Battle } from '../battles/battle'
import { HeaderFact } from '../../components/HeaderFact'

const FORM = 5

const RESULT = {
  won: { letter: 'W', tint: 'bg-achieved/10 text-achieved' },
  lost: { letter: 'L', tint: 'bg-rust/10 text-rust' },
  drawn: { letter: 'D', tint: 'bg-raised text-dim' },
} as const

/**
 * A player at a glance under their name: their last few results, newest first, the army
 * they bring most, and their overall leaderboard place; for a player who only builds,
 * how many lists they publish and the army they build most; and their achievement points.
 *
 * Read from the battles the reader may watch, the same ones the record counts.
 */
export function ProfileForm({
  battles,
  userId,
  rank,
  lists,
  achievementPoints,
}: {
  battles: readonly Battle[]
  userId: string
  rank: { place: number; of: number } | null
  /** The player's published lists, and the army most of them field. */
  lists: { count: number; main: FactionPresentation | null }
  achievementPoints: number
}) {
  const seated = battles.flatMap((battle) => {
    const seat = battle.playerIds.indexOf(userId)
    return seat === -1 ? [] : [{ battle, seat }]
  })
  const form = seated.filter(({ battle }) => battle.status === 'finished').slice(0, FORM)
  const armies = new Map<string, { faction: StandingFaction; battles: number }>()
  for (const { battle, seat } of seated) {
    const faction = battle.factions[seat]
    if (faction) armies.set(faction.slug, { faction, battles: (armies.get(faction.slug)?.battles ?? 0) + 1 })
  }
  const played = [...armies.values()].toSorted((one, other) => other.battles - one.battles)[0]?.faction
  const main = played ?? lists.main
  if (!form.length && !main && !rank && !lists.count && !achievementPoints) return null
  return (
    <div
      className="grid grid-cols-2 border-y border-edge sm:flex sm:flex-wrap sm:items-stretch sm:divide-x sm:divide-edge"
      data-profile-form
    >
      {form.length ? (
        <HeaderFact label="Form">
          <span className="flex gap-1">
            {form.map(({ battle, seat }) => {
              const result = RESULT[battleOutcome(battle, battle.sides[seat]!)]
              return (
                <Link
                  key={battle.token}
                  to="/battles/$token"
                  params={{ token: battle.token }}
                  aria-label={`${result.letter} against ${battle.players.filter((_, index) => index !== seat).join(' & ')}`}
                  className={`figure grid size-6 place-items-center rounded-sm text-sm ${result.tint} hover:brightness-125`}
                >
                  {result.letter}
                </Link>
              )
            })}
          </span>
        </HeaderFact>
      ) : null}
      {main ? (
        <HeaderFact label={played ? 'Plays most' : 'Builds most'}>
          <span className="flex items-center gap-1.5 text-base font-medium text-bone">
            <FactionMark faction={main} size="sm" />
            {main.displayName}
          </span>
        </HeaderFact>
      ) : null}
      {lists.count ? (
        <HeaderFact label="Lists">
          <span className="figure text-xl leading-none text-bone">{lists.count}</span>
        </HeaderFact>
      ) : null}
      {rank ? (
        <Link to="/leaderboard" search={{ faction: undefined }} className="flex transition-colors hover:bg-raised">
          <HeaderFact label="Leaderboard">
            <span className="figure text-xl leading-none text-bone">
              #{rank.place}
              <span className="font-sans text-xs font-normal text-faint"> of {rank.of}</span>
            </span>
          </HeaderFact>
        </Link>
      ) : null}
      {achievementPoints ? (
        <Link to="/users/$userId" params={{ userId }} search={{ tab: 'achievements' }} className="flex transition-colors hover:bg-raised">
          <HeaderFact label="Achievements">
            <span className="figure text-xl leading-none text-bone">
              {achievementPoints}
              <span className="font-sans text-xs font-normal text-faint"> pts</span>
            </span>
          </HeaderFact>
        </Link>
      ) : null}
    </div>
  )
}
