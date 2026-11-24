import { type Phase, type StratagemWindow, stratagemTimingRefusal, type TurnScope } from '../../../core/battlePhases'

type StratagemTiming = { phases?: Phase[]; turn?: TurnScope; windows?: StratagemWindow[] }

export function stratagemVisibleNow(stratagem: StratagemTiming, phase: Phase, ownTurn: boolean, showAll = false) {
  return showAll || !stratagemTimingRefusal(stratagem, phase, ownTurn)
}

export function hiddenNow(stratagems: readonly StratagemTiming[], phase: Phase, ownTurn: boolean) {
  return stratagems.filter((stratagem) => !stratagemVisibleNow(stratagem, phase, ownTurn)).length
}
