/** The phases of a battle round, in the order 11th edition plays them. */
export const PHASES = ['command', 'movement', 'shooting', 'charge', 'fight', 'end'] as const

export type Phase = (typeof PHASES)[number]

/** Whose turn a stratagem or reminder applies in. */
export const TURN_SCOPES = ['your-turn', 'opponent-turn', 'either'] as const

export type TurnScope = (typeof TURN_SCOPES)[number]

export const BATTLE_ROUNDS = 5

/** A phase in one player's turn, for a stratagem whose phases are each in a different turn. */
export type StratagemWindow = { phase: Phase; turn: TurnScope }

const fitsTurn = (turn: TurnScope | undefined, ownTurn: boolean) =>
  turn === 'your-turn' ? ownTurn : turn === 'opponent-turn' ? !ownTurn : true

/**
 * Why a stratagem cannot be used in this phase of this player's turn, or null when it can: its windows decide where it
 * has them, else its phases and turn.
 */
export function stratagemTimingRefusal(
  stratagem: { phases?: readonly Phase[]; turn?: TurnScope; windows?: readonly StratagemWindow[] },
  phase: Phase,
  ownTurn: boolean,
): { refused: 'phase' } | { refused: 'turn'; turn: TurnScope } | null {
  if (stratagem.windows) {
    const inPhase = stratagem.windows.filter((window) => window.phase === phase)
    if (!inPhase.length) return { refused: 'phase' }
    return inPhase.some((window) => fitsTurn(window.turn, ownTurn)) ? null : { refused: 'turn', turn: inPhase[0]!.turn }
  }
  if (stratagem.phases?.length && !stratagem.phases.includes(phase)) return { refused: 'phase' }
  return fitsTurn(stratagem.turn, ownTurn) ? null : { refused: 'turn', turn: stratagem.turn! }
}
