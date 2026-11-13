import type { CSSProperties } from 'react'
import { playerColour, sideColour } from '../core/playerColours'

/** A player's name in their own colour, wherever it is written outside a battle's sides. */
export const nameColour = (player: { id: string; colour?: string | null }): CSSProperties => ({
  color: sideColour(playerColour(player)).text,
})
