type AdvancePrompts = {
  scoring: boolean
  secretMission: boolean
  tacticalDiscard: boolean
  fireOverwatch: boolean
}

export function shouldRequestAdvance(advanceRequested: boolean, prompts: AdvancePrompts) {
  return !advanceRequested && (prompts.scoring || prompts.secretMission || prompts.tacticalDiscard || prompts.fireOverwatch)
}
