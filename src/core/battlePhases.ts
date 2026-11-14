/** The phases of a battle round, in the order 11th edition plays them. */
export const PHASES = ['command', 'movement', 'shooting', 'charge', 'fight', 'end'] as const

export type Phase = (typeof PHASES)[number]

/** Whose turn a stratagem or reminder applies in. */
export const TURN_SCOPES = ['your-turn', 'opponent-turn', 'either'] as const

export type TurnScope = (typeof TURN_SCOPES)[number]

export const BATTLE_ROUNDS = 5
