import { expect, it } from 'vitest'
import { textFactsOfVsData } from './vsDataEffects'

const reroll = { role: 'attacker', attacks: ['melee'], rolls: { hitReroll: 'ones' } }
/** A combat block whose one reading holds in an own and an aura context. */
const combat = (reading: Record<string, unknown>) => ({
  combat: { readings: [reading], trees: [[{ reading: 0 }]], contexts: { 'own.many.known': 0, 'aura.many.known': 0 } },
})

it('starts a unit’s own ability on its unconditional choice', () => {
  const facts = textFactsOfVsData(combat({ choices: [{ conditions: [], effects: [reroll] }], default: 1 }))
  expect(facts.combat!.leaves[facts.combat!.readings['unit:0:1']![0] as number]!.compiled!.defaultChoice).toBe(1)
})

it('starts another unit’s aura off, whatever VS Data says holds', () => {
  const facts = textFactsOfVsData(combat({ choices: [{ conditions: [], effects: [reroll] }], default: 1 }))
  expect(facts.combat!.leaves[facts.combat!.readings['nearby:0:1']![0] as number]!.compiled!.defaultChoice).toBe(0)
})

it('starts a unit in the state its rule names', () => {
  const state = (option: string) => ({ option, conditions: [{ kind: 'option' }], effects: [reroll] })
  const facts = textFactsOfVsData(combat({ choices: [state('Assault'), state('Defence')], default: 2 }))
  expect(facts.combat!.leaves[facts.combat!.readings['nearby:0:1']![0] as number]!.compiled!.defaultChoice).toBe(2)
})

it('reads a Stratagem’s Fight phase placement', () => {
  const facts = textFactsOfVsData({
    combat: { readings: [{ choices: [], default: 0 }], trees: [[{ reading: 0 }]], contexts: { 'stratagem-fight.one.unknown': 0 } },
  })
  expect(Object.keys(facts.combat!.readings)).toEqual(['stratagem:1:0:melee'])
})

it('gives the whole unit an effect VS Data limits to the bearer, as Praetorium always has', () => {
  const facts = textFactsOfVsData(combat({ choices: [{ conditions: [], effects: [{ ...reroll, bearerOnly: true }] }], default: 1 }))
  expect(facts.combat!.leaves[0]!.compiled!.choices[0]!.effects).toEqual([
    { role: 'attacker', phases: ['melee'], options: { hitReroll: 'ones' } },
  ])
})

it('names a choice by its conditions', () => {
  const facts = textFactsOfVsData(
    combat({ choices: [{ conditions: [{ kind: 'charged' }, { kind: 'within', inches: 6 }], effects: [reroll] }], default: 0 }),
  )
  expect(facts.combat!.leaves[0]!.compiled!.choices[0]!.label).toBe('Charged this turn · Within 6"')
})

it('reads a combat block VS Data holds back as not calculated', () => {
  const unread = textFactsOfVsData({ combat: { unresolved: 'Not read yet.' } }).combat!
  expect(unread.leaves[unread.readings['nearby:0:1']![0] as number]).toEqual({
    compiled: null,
    legacy: [],
    legacyDefault: 0,
    roles: ['attacker', 'defender'],
  })
})

it('reads a reminder’s turn as Praetorium names it', () => {
  const facts = textFactsOfVsData({ reminder: { timings: [{ at: 'phase-start', phase: 'shooting', turn: 'opponent' }] } })
  expect(facts.reminder).toEqual({ timings: [{ moment: 'phase-start', phase: 'shooting', turn: 'opponent-turn' }] })
})
