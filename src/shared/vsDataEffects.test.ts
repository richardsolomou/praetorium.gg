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

it('calculates no mortal wounds VS Data places outside the attacks', () => {
  const mortals = { timing: 'outside-attacks', rolls: 1, outcomes: [{ min: 4, max: 6, damage: { dice: 1, sides: 3, bonus: 0 } }] }
  const facts = textFactsOfVsData(
    combat({ choices: [{ conditions: [], effects: [{ role: 'attacker', attacks: ['ranged'], mortalWounds: mortals }] }], default: 1 }),
  )
  expect(facts.combat!.leaves[0]!.compiled!.choices[0]!.effects).toEqual([])
})

it('reads an Order allowance that holds only while leading', () => {
  const facts = textFactsOfVsData({ options: { allowances: [{ options: 'Orders', limit: 2, whileLeading: true }] } })
  expect(facts.battleChoiceAllowances).toEqual([{ options: 'Orders', limit: 2, leading: true }])
})

it('rolls mortal wounds once per point of Toughness where VS Data says so', () => {
  const mortals = {
    timing: 'before',
    rolls: 1,
    perToughness: true,
    max: 6,
    outcomes: [{ min: 5, max: 6, damage: { dice: 0, sides: 6, bonus: 1 } }],
  }
  const facts = textFactsOfVsData(
    combat({ choices: [{ conditions: [], effects: [{ role: 'attacker', attacks: ['melee'], mortalWounds: mortals }] }], default: 1 }),
  )
  expect(facts.combat!.leaves[0]!.compiled!.choices[0]!.effects[0]!.mortalWounds).toMatchObject({ perToughness: true, limit: 6 })
})

it('leaves out a single save re-roll the simulator cannot give a rule', () => {
  const rolls = { singleRerolls: ['hit', 'save'] }
  const facts = textFactsOfVsData(
    combat({ choices: [{ conditions: [], effects: [{ role: 'attacker', attacks: ['ranged'], rolls }] }], default: 1 }),
  )
  expect(facts.combat!.leaves[0]!.compiled!.choices[0]!.effects[0]!.options).toEqual({ singleRerolls: ['hit'] })
})

it('gives a keyword a rule grants as an ability of that name', () => {
  const facts = textFactsOfVsData({ grants: { keywords: [{ keyword: 'MOBILE', to: 'unit' }] } })
  expect(facts.abilityGrants!.grants).toEqual([{ written: 'Mobile', recipient: 'unit' }])
})

it('leaves out a grant VS Data marks conditional, as a triggered return from Strategic Reserves', () => {
  const facts = textFactsOfVsData({ grants: { abilities: [{ ability: 'Deep Strike', to: 'unit', conditional: true }] } })
  expect(facts.abilityGrants!.grants).toEqual([])
})

it('keeps a conditional grant whose condition is the unit it attaches to', () => {
  const grant = { ability: 'Deep Strike', to: 'bearer', conditional: true, counterpart: ['WORLD EATERS POSSESSED'] }
  const facts = textFactsOfVsData({ grants: { abilities: [grant] } })
  expect(facts.abilityGrants!.grants).toHaveLength(1)
})
