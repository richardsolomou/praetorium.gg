import { createContext, useContext, type ReactNode } from 'react'
import { battleColours, type SideColour } from '../../../core/playerColours'

const BattleColours = createContext<ReadonlyMap<string, SideColour>>(new Map())

export const BattleColoursProvider = BattleColours.Provider

/** A player's name in their own colour, over the side tint around it, so teammates stay apart. */
export function PlayerTint({ playerId, className, children }: { playerId: string; className?: string; children: ReactNode }) {
  const colour = useContext(BattleColours).get(playerId)
  return (
    <span className={className} style={colour ? { color: colour.text } : undefined}>
      {children}
    </span>
  )
}

const NO_COLOURS = new Map<string, SideColour>()

/**
 * Paints each side in its players' colours for as long as the battle is open.
 *
 * The side tokens are set on the root rather than a wrapper, because the battle's dialogs
 * and its victory confetti render outside the page and read them too.
 */
export function PaintedBattle({ players, children }: { players: Parameters<typeof battleColours>[0]; children: ReactNode }) {
  const colours = battleColours(players)
  const declarations = Object.entries(colours?.variables ?? {})
    .map(([name, value]) => `${name}:${value}`)
    .join(';')
  return (
    <BattleColoursProvider value={colours?.players ?? NO_COLOURS}>
      {colours ? <style>{`:root{${declarations}}`}</style> : null}
      {children}
    </BattleColoursProvider>
  )
}
