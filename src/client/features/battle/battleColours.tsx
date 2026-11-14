import { createContext, useContext, type ReactNode } from 'react'
import type { SideColour } from '../../../core/playerColours'

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
