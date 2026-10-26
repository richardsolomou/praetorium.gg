import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { battleOutcome, type StandingFaction } from '../../../core/standings'
import { FactionMark, type FactionPresentation } from '../../components/FactionMark'
import type { Battle } from '../battles/battle'

const FORM = 5

const RESULT = {
  won: { letter: 'W', tint: 'border-achieved/60 bg-achieved/15 text-achieved' },
  lost: { letter: 'L', tint: 'border-rust/60 bg-rust/15 text-rust' },
  drawn: { letter: 'D', tint: 'border-edge-strong bg-raised text-dim' },
} as const

/**
 * A player at a glance under their name: their last few results, newest first, the army
 * they bring most, and their overall leaderboard place; for a player who only builds,
 * how many lists they publish and the army they build most.
 *
 * Read from the battles the reader may watch, the same ones the record counts.
 */
export function ProfileForm({
  battles,
  userId,
  rank,
  lists,
}: {
  battles: readonly Battle[]
  userId: string
  rank: { place: number; of: number } | null
  /** The player's published lists, and the army most of them field. */
  lists: { count: number; main: FactionPresentation | null }
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
  if (!form.length && !main && !rank && !lists.count) return null
  return (
    <div className="flex flex-wrap items-stretch gap-2" data-profile-form>
      {form.length ? (
        <Fact label="Form">
          <span className="flex gap-1">
            {form.map(({ battle, seat }) => {
              const result = RESULT[battleOutcome(battle, battle.sides[seat]!)]
              return (
                <Link
                  key={battle.token}
                  to="/battles/$token"
                  params={{ token: battle.token }}
                  aria-label={`${result.letter} against ${battle.players.filter((_, index) => index !== seat).join(' & ')}`}
                  className={`figure grid size-6 place-items-center border text-xs font-bold ${result.tint} hover:brightness-125`}
                >
                  {result.letter}
                </Link>
              )
            })}
          </span>
        </Fact>
      ) : null}
      {main ? (
        <Fact label={played ? 'Plays most' : 'Builds most'}>
          <span className="flex items-center gap-1.5 text-sm font-bold text-bone uppercase">
            <FactionMark faction={main} size="sm" />
            {main.displayName}
          </span>
        </Fact>
      ) : null}
      {lists.count ? (
        <Fact label="Lists">
          <span className="figure text-sm font-bold text-bone">{lists.count}</span>
        </Fact>
      ) : null}
      {rank ? (
        <Link
          to="/leaderboard"
          search={{ faction: undefined }}
          className="flex [&>span]:transition-colors [&>span]:hover:border-edge-strong [&>span]:hover:bg-raised"
        >
          <Fact label="Leaderboard">
            <span className="figure text-sm font-bold text-bone">
              #{rank.place}
              <span className="font-normal text-faint"> of {rank.of}</span>
            </span>
          </Fact>
        </Link>
      ) : null}
    </div>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex flex-col gap-1.5 border border-edge bg-sunken/60 px-3 py-2">
      <span className="eyebrow text-faint">{label}</span>
      {children}
    </span>
  )
}
