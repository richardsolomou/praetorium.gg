import { Link } from '@tanstack/react-router'
import { Fragment, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { isGuestSeat } from '../../../core/newBattle'
import type { Army, Side } from '../../sides'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { tint } from './battleTints'
import { PlayerTint } from './battleColours'

/** A side's colour, where its name is not on screen to carry it. */
export function SideDot({ side }: { side: number }) {
  return <span aria-hidden className={`size-2 shrink-0 rounded-full ${tint(side).rail}`} />
}

/**
 * A player, pictured and named, and the way out to their profile.
 *
 * One picture at one size wherever a seat is named — the side panel during a battle
 * and the strip above setup — so a player is recognised the same way from the first
 * screen of a game to the last. A seat the table plays has no profile to go to, and a
 * guest's name says what they are instead.
 */
export function PlayerName({ army, linked = true, badge }: { army: Army; linked?: boolean; badge?: ReactNode }) {
  const guest = isGuestSeat(army.playerId)
  if (army.automated) linked = false
  const inner = (
    <>
      <PlayerAvatar name={army.playerName} image={army.playerImage} className="size-6 text-xs" />
      <PlayerTint playerId={army.playerId} className={`break-words ${linked ? 'group-hover:underline' : ''}`}>
        {army.playerName}
        {/* Inside the name so it wraps with it rather than squeezing it in a narrow card. */}
        {guest ? <span className="chip ml-1.5 align-middle">Guest</span> : badge}
      </PlayerTint>
    </>
  )
  // Unlinked where the card around it is already a control: a link inside a button is
  // neither valid nor pressable, and the way out to a profile is on screen elsewhere.
  if (!linked) return <span className="inline-flex min-w-0 items-center gap-1.5">{inner}</span>
  return (
    <Link to="/users/$userId" params={{ userId: army.playerId }} className="group inline-flex min-w-0 items-center gap-1.5">
      {inner}
    </Link>
  )
}

/** A side named the way `sideName` writes it, each player in their own colour. */
export function SideNames({ side }: { side: { armies: readonly { playerId: string; playerName: string }[] } }) {
  return side.armies.map((army, at) => (
    <Fragment key={army.playerId}>
      {at ? <span className="text-dim"> &amp; </span> : null}
      <PlayerTint playerId={army.playerId}>{army.playerName}</PlayerTint>
    </Fragment>
  ))
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
      className={cn('flex flex-wrap items-center gap-x-2 text-sm font-bold uppercase', tint(side.index).text, className)}
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
