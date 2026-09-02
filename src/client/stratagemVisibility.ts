import { isFireOverwatch, type Phase } from '../core/battle'

export type StratagemTiming = {
  name: string
  phases?: readonly Phase[]
  turn?: string
}

function playableIn(stratagem: StratagemTiming, phase: Phase, advanceRequested: boolean) {
  if (isFireOverwatch(stratagem)) return phase === 'movement' && advanceRequested
  return !stratagem.phases?.length || stratagem.phases.includes(phase)
}

function playableOnTurn(stratagem: StratagemTiming, ownTurn: boolean) {
  if (stratagem.turn === 'your-turn') return ownTurn
  if (stratagem.turn === 'opponent-turn') return !ownTurn
  return true
}

export function stratagemVisibleNow(
  stratagem: StratagemTiming,
  phase: Phase,
  ownTurn: boolean,
  advanceRequested: boolean,
  includeOtherPhases = false,
) {
  return playableOnTurn(stratagem, ownTurn) && (includeOtherPhases || playableIn(stratagem, phase, advanceRequested))
}

export function hiddenThisPhase(stratagems: readonly StratagemTiming[], phase: Phase, ownTurn: boolean, advanceRequested: boolean) {
  return stratagems.filter((stratagem) => playableOnTurn(stratagem, ownTurn) && !playableIn(stratagem, phase, advanceRequested)).length
}

export function shouldOpenOverwatchWindow(stratagems: readonly Pick<StratagemTiming, 'name'>[], phase: Phase, advanceRequested: boolean) {
  return !advanceRequested && phase === 'movement' && stratagems.some(isFireOverwatch)
}
