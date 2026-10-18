import type { Phase } from '../../../core/battle'

type StratagemTiming = {
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

export function stratagemVisibleNow(stratagem: StratagemTiming, phase: Phase, ownTurn: boolean, showAll = false) {
  return showAll || (playableOnTurn(stratagem, ownTurn) && playableIn(stratagem, phase))
}

export function hiddenNow(stratagems: readonly StratagemTiming[], phase: Phase, ownTurn: boolean) {
  return stratagems.filter((stratagem) => !stratagemVisibleNow(stratagem, phase, ownTurn)).length
}
