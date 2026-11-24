import { expect, it } from 'vitest'
import { datasheetFixture } from '../core/datasheet.fixtures'
import { combatTarget } from '../core/combatProfiles'
import { activeCombatRules, combatRuleChoices, combatRuleKey, type CombatRule } from '../core/combatRules'
import type { VsDataInvulnerableSave } from './vsData'
import { withVsDataSaves } from './vsDataSaves'

const model = (name: string, invulnerable?: string) => ({
  id: name,
  name,
  type: 'Unit',
  values: [
    { name: 'T', value: '4' },
    { name: 'Sv', value: '3+' },
    { name: 'W', value: '3' },
    ...(invulnerable ? [{ name: 'InSv', value: invulnerable }] : []),
  ],
})
const catalogueRule: CombatRule = { id: 'written', name: 'Invulnerable Save (5+*)', source: 'Unit', description: '', scope: 'unit' }
const combatant = (profiles: ReturnType<typeof model>[], saves: VsDataInvulnerableSave[]) =>
  withVsDataSaves(
    { selected: datasheetFixture({ id: 'unit', name: 'Unit', profiles }), rules: [catalogueRule], companions: [] },
    { units: { unit: { id: 'faction.unit', sizes: [], models: [], options: [], invulnerableSaves: saves } }, abilities: {}, aliases: {} },
  )
const saveRule = (projected: ReturnType<typeof combatant>) => projected.rules.find((rule) => rule.id.startsWith('vs-data-invulnerable:'))!

it('holds a save against ranged attacks only for ranged attacks', () => {
  const rule = saveRule(combatant([model('Knight Paladin', '5+*')], [{ profile: 'paladin', roll: 5, against: 'ranged' }]))
  expect(activeCombatRules([rule], {})[0]!.effects).toEqual([{ role: 'defender', phases: ['ranged'], invulnerable: 5 }])
})

it('leaves a conditional save off until a player turns it on, labelled by its condition’s summary', () => {
  const summary = { blocks: [{ paragraph: [{ text: 'Until it loses a wound.' }] }], questions: [] }
  const rule = saveRule(combatant([model('Archon', '2+*')], [{ profile: 'archon', roll: 2, conditional: true, summary }]))
  expect([
    activeCombatRules([rule], {}).length,
    activeCombatRules([rule], { [combatRuleKey(rule)]: 1 }).map(({ effects }) => effects),
    combatRuleChoices(rule).map(({ label }) => label),
  ]).toEqual([0, [[{ role: 'defender', phases: ['ranged', 'melee'], invulnerable: 2 }]], ['Until it loses a wound.']])
})

it('lets a unit whose catalogue figure is starred be a defender', () => {
  const projected = combatant(
    [model('Wych', '4+* / 6+'), model('Hekatrix', '4+* / 6+')],
    [{ profile: 'wyches', roll: 6, against: 'ranged', conditional: true }],
  )
  expect(combatTarget(projected.selected, 10).error).toBeNull()
})

it('puts a model’s own save on that model only', () => {
  const projected = combatant([model('Ibram Gaunt'), model('Tanith Ghost')], [{ profile: 'gaunt', model: 'Ibram Gaunt', roll: 5 }])
  expect(projected.selected.profiles.map((profile) => profile.values.find((value) => value.name === 'InSv')?.value)).toEqual([
    '5+',
    undefined,
  ])
})

it('drops the catalogue’s written save, which the typed one stands for, and changes nothing applied twice', () => {
  const once = combatant([model('Knight Paladin', '5+*')], [{ profile: 'paladin', roll: 5, against: 'ranged' }])
  const twice = withVsDataSaves(once, {
    units: {
      unit: {
        id: 'faction.unit',
        sizes: [],
        models: [],
        options: [],
        invulnerableSaves: [{ profile: 'paladin', roll: 5, against: 'ranged' }],
      },
    },
    abilities: {},
    aliases: {},
  })
  expect(twice.rules.map((rule) => rule.name)).toEqual(['Invulnerable save 5+'])
})
