import type { Phase } from '../core/battle'

export type StratagemTiming = {
  phases?: Phase[]
  turn?: string
}

function playableIn(stratagem: StratagemTiming, phase: Phase) {
  return !stratagem.phases?.length || stratagem.phases.includes(phase)
}

function playableOnTurn(stratagem: StratagemTiming, ownTurn: boolean) {
  if (stratagem.turn === 'your-turn') return ownTurn
  if (stratagem.turn === 'opponent-turn') return !ownTurn
  return true
}

export function stratagemVisibleNow(stratagem: StratagemTiming, phase: Phase, ownTurn: boolean, includeOtherPhases = false) {
  return playableOnTurn(stratagem, ownTurn) && (includeOtherPhases || playableIn(stratagem, phase))
}

export function hiddenThisPhase(stratagems: readonly StratagemTiming[], phase: Phase, ownTurn: boolean) {
  return stratagems.filter((stratagem) => playableOnTurn(stratagem, ownTurn) && !playableIn(stratagem, phase)).length
}
