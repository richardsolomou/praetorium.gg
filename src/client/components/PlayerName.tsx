import { Link } from '@tanstack/react-router'
import type { Army, Side } from '../sides'
import { PlayerAvatar } from './PlayerAvatar'
import { tint } from './battle/tints'

/**
 * A player, pictured and named, and the way out to their profile.
 *
 * One picture at one size wherever a seat is named — the side panel during a battle
 * and the strip above setup — so a player is recognised the same way from the first
 * screen of a game to the last.
 */
export function PlayerName({ army, linked = true, className = '' }: { army: Army; linked?: boolean; className?: string }) {
  const inner = (
    <>
      <PlayerAvatar name={army.playerName} image={army.playerImage} className="size-6 text-xs" />
      <span className={`break-words ${linked ? 'group-hover:underline' : ''}`}>{army.playerName}</span>
    </>
  )
  // Unlinked where the card around it is already a control: a link inside a button is
  // neither valid nor pressable, and the way out to a profile is on screen elsewhere.
  if (!linked) return <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>{inner}</span>
  return (
    <Link to="/users/$userId" params={{ userId: army.playerId }} className={`group inline-flex min-w-0 items-center gap-1.5 ${className}`}>
      {inner}
    </Link>
  )
}

/**
 * Everyone on a side, pictured and named, joined the way the side is named.
 *
 * Wherever a side is introduced rather than scored — above setup, and beside the
 * mission it plays — this is what introduces it, in the tint the side keeps for the
 * whole game.
 */
export function SidePlayers({ side, linked = true, className = '' }: { side: Side; linked?: boolean; className?: string }) {
  return (
    <p
      data-players={side.index}
      className={`flex flex-wrap items-center gap-x-2 text-sm font-bold uppercase ${tint(side.index).text} ${className}`}
    >
      {side.armies.map((army, at) => (
        <span key={army.playerId} className="inline-flex min-w-0 items-center gap-x-2">
          {at ? <span className="text-dim">&amp;</span> : null}
          <PlayerName army={army} linked={linked} />
        </span>
      ))}
    </p>
  )
}
