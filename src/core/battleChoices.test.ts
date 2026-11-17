import { describe, expect, it } from 'vitest'
import { battleChoiceActive, battleChoiceAllowances, battleChoices, battleChoiceSheet } from './battleChoices'
import type { CombatRule } from './combatRules'
import { datasheetFixture } from './datasheet.fixtures'

const rule = (description: string, extra: Partial<CombatRule> = {}): CombatRule => ({
  id: 'army:stances',
  name: 'Battle Stances',
  source: 'Army rule',
  scope: 'unit',
  description,
  ...extra,
})
const stances = rule(
  'At the start of the battle round, you can select one of the Battle Stances below. Until the end of the battle round, that Battle Stance is active for your army, and all units from your army that have the Battle Stances ability gain the relevant abilities shown below.\n\n### HOLD STANCE\n\n■ Ranged weapons equipped by models in this unit have the **[HEAVY]** ability.\n■ Each time a melee attack targets this unit, if this unit has the **BATTLELINE** keyword, subtract 1 from the Hit roll.\n\n### ADVANCE STANCE\n\n■ Ranged weapons equipped by models in this unit have the **[ASSAULT]** ability.\n■ Add 1 to the Toughness characteristic of models in this unit.',
)
const sheet = datasheetFixture({
  profiles: [
    {
      id: 'unit',
      name: 'Walker',
      type: 'Unit',
      count: 1,
      values: Object.entries({ M: '6"', T: '9', Sv: '2+' }).map(([name, value]) => ({ name, value })),
    },
    {
      id: 'gun',
      name: 'Gun',
      type: 'Ranged Weapons',
      count: 1,
      values: Object.entries({ A: '3', BS: '4+', Keywords: 'Ignores Cover' }).map(([name, value]) => ({ name, value })),
    },
  ],
})
const active = (label: string) => {
  const choice = battleChoices([stances])[0]!
  return [{ name: choice.rule.name, effects: choice.options.find((option) => option.label === label)!.effects }]
}

describe('rules a player chooses between during the battle', () => {
  it('names each option once, unshouted, without the conditions it reads', () =>
    expect(battleChoices([stances])[0]!.options.map((option) => option.label)).toEqual(['Hold Stance', 'Advance Stance']))

  it('keeps one pick for the army when a rule makes its option active for the army', () =>
    expect(battleChoices([stances])[0]!.armyWide).toBe(true))

  it('keeps a pick for each unit when each unit is in its own option', () =>
    expect(
      battleChoices([
        rule(
          'In your Command phase, if this unit is on the battlefield, you can select one routine from those listed below for that unit to enter. Once a unit enters a routine, it remains in that routine until it enters a different one.\n- Strike Routine: Add 2 to the Attacks characteristic of ranged weapons equipped by models in this unit.\n- Guard Routine: Add 1 to the Toughness characteristic of models in this unit.',
        ),
      ])[0]!.armyWide,
    ).toBe(false))

  it('leaves out a rule whose choices are only its conditions', () =>
    expect(
      battleChoices([
        rule('Each time a model in this unit makes an attack, if this unit is within range of an objective marker, add 1 to the Hit roll.'),
      ]),
    ).toEqual([]))

  it('leaves out a rule whose options change nothing a datasheet shows', () =>
    expect(
      battleChoices([
        rule(
          'At the start of the battle round, you can select one of the Battle Stances below. Until the end of the battle round, that Battle Stance is active for your army, and all units from your army that have the Battle Stances ability gain the relevant abilities shown below.\n\n### HOLD STANCE\n\n■ Each time a model in this unit makes an attack, re-roll a Hit roll of 1.\n\n### ADVANCE STANCE\n\n■ Each time a model in this unit makes an attack, re-roll a Wound roll of 1.',
        ),
      ]),
    ).toEqual([]))

  it('keeps the small words of a shouted option name lowercase', () =>
    expect(
      battleChoices([{ ...stances, description: stances.description.replace('ADVANCE STANCE', 'HOLD AND ADVANCE') }])[0]!.options[1]!.label,
    ).toBe('Hold and Advance'))

  it('leaves out a rule with only one option', () =>
    expect(
      battleChoices([
        rule(
          'In your Command phase, if this unit is on the battlefield, you can select one routine from those listed below for that unit to enter. Once a unit enters a routine, it remains in that routine until it enters a different one.\n- Strike Routine: Add 2 to the Attacks characteristic of ranged weapons equipped by models in this unit.',
        ),
      ]),
    ).toEqual([]))

  it('leaves out a stratagem, which the player uses rather than picks for the unit', () =>
    expect(battleChoices([{ ...stances, scope: 'stratagem' }])).toEqual([]))

  it('draws no Toughness bonus that holds only under a condition the sheet cannot judge', () =>
    expect(
      battleChoiceSheet(sheet, [
        { name: 'Grit', effects: [{ role: 'defender', phases: ['ranged', 'melee'], toughness: 1, condition: 'stronger' }] },
      ]).profiles[0]!.values[1]!.value,
    ).toBe('9'))

  it('keeps the options another rule always makes active together', () =>
    expect(
      battleChoices([stances, rule('The Hold Stance and Advance Stance are both active for this unit.', { name: 'Steadfast' })])[0]!
        .together,
    ).toEqual({ labels: ['Hold Stance', 'Advance Stance'], source: 'Steadfast' }))

  it('offers the options another rule makes active together only when its condition is met', () =>
    expect(
      battleChoices([
        stances,
        rule(
          'At the start of the battle round, you can select one friendly unit within 6" of this model; the Hold Stance and Advance Stance are both active for that unit.',
          { name: 'Steadfast' },
        ),
      ])[0]!.options.at(-1)!.label,
    ).toBe('Both · Steadfast'))

  it('adds an ability that changes no roll to the weapons', () =>
    expect(battleChoiceSheet(sheet, active('Advance Stance')).profiles[1]!.values.at(-1)).toEqual({
      name: 'Keywords',
      value: 'Ignores Cover, Assault',
      modifiers: ['Battle Stances'],
    }))

  it('raises the unit’s Toughness', () =>
    expect(battleChoiceSheet(sheet, active('Advance Stance')).profiles[0]!.values[1]).toEqual({
      name: 'T',
      value: '10',
      baseValue: '9',
      modifiers: ['Battle Stances'],
    }))
})

describe('options that change the unit’s own characteristics', () => {
  const drills = rule(
    'In your Command phase, if this unit is on the battlefield, you can select one drill from those listed below for that unit to enter. Once a unit enters a drill, it remains in that drill until it enters a different one.\n- Double Time: Add 3" to the Move characteristic of models in this unit.\n- Dig In: Improve the Save characteristic of models in this unit by 1 (this cannot improve a model’s Save to better than 3+).\n- Hold the Line: Improve the Leadership and Objective Control characteristics of models in this unit by 1.',
    { name: 'Drills' },
  )
  const trooper = (save: string) =>
    datasheetFixture({
      profiles: [
        {
          id: 'unit',
          name: 'Trooper',
          type: 'Unit',
          count: 1,
          values: Object.entries({ M: '6"', T: '3', Sv: save, W: '1', Ld: '7+', OC: '2' }).map(([name, value]) => ({ name, value })),
        },
      ],
    })
  const statLine = (label: string, save = '5+') => {
    const option = battleChoices([drills])[0]!.options.find((candidate) => candidate.label === label)!
    return battleChoiceSheet(trooper(save), [{ name: 'Drills', effects: option.effects }]).profiles[0]!.values.map(({ value }) => value)
  }

  it('adds to the Move characteristic', () => expect(statLine('Double Time')).toEqual(['9"', '3', '5+', '1', '7+', '2']))
  it('improves the Save characteristic', () => expect(statLine('Dig In')).toEqual(['6"', '3', '4+', '1', '7+', '2']))
  it('never improves the Save past the best the rule allows', () => expect(statLine('Dig In', '3+')[2]).toBe('3+'))
  it('improves Leadership and Objective Control', () => expect(statLine('Hold the Line')).toEqual(['6"', '3', '5+', '1', '6+', '3']))
})

describe('options that give the unit a named ability', () => {
  const overrides = rule(
    'In your Command phase, if this unit is on the battlefield, you can select one override from those listed below for that unit to enter. Once a unit enters an override, it remains in that override until it enters a different one.\n- Muted Servomotors: Models in this unit have the Stealth ability.\n- Hold Fast: Add 1 to the Toughness characteristic of models in this unit.',
    { name: 'Overrides' },
  )
  const picked = (label: string) => {
    const option = battleChoices([overrides])[0]!.options.find((candidate) => candidate.label === label)!
    return battleChoiceSheet(sheet, [{ name: 'Overrides', effects: option.effects }])
  }

  it('lists the ability among the unit’s core abilities', () =>
    expect(picked('Muted Servomotors').abilities).toContainEqual(
      expect.objectContaining({ name: 'Stealth', source: 'Overrides', kind: 'core' }),
    ))
  it('lists it only while that option is picked', () =>
    expect(picked('Hold Fast').abilities.map(({ name }) => name)).not.toContain('Stealth'))
  it('offers a rule whose only drawn change is a named ability', () =>
    expect(
      battleChoices([
        {
          ...overrides,
          description: overrides.description.replace(/\n- Hold Fast.+$/, '\n- Lurk: Models in this unit have the Stealth ability.'),
        },
      ]),
    ).toHaveLength(1))
})

describe('a unit that can be in more than one option', () => {
  const orders = rule(
    'If your Army Faction is ARMY, OFFICER with this ability can issue Orders. Each time one does, select one of the Orders below.\n\n### HOLD FAST!\nAdd 1 to the Toughness characteristic of models in this unit.\n\n### OPEN FIRE!\nImprove the Ballistic Skill characteristic of ranged weapons equipped by models in this unit by 1.\n\n### CHARGE!\nAdd 3" to the Move characteristic of models in this unit.',
    { name: 'Orders' },
  )
  const choiceWith = (text: string) => battleChoices([orders], battleChoiceAllowances([text]))[0]!
  const effectsWith = (text: string, picked: string[]) => battleChoiceActive(choiceWith(text), picked) ?? []

  it('takes two Orders at once where another rule allows it', () =>
    expect(
      choiceWith('While the bearer is leading a unit, that unit can be affected by up to two different Orders at the same time.').limit,
    ).toBe(2))

  it('takes one Order where nothing allows more', () => expect(battleChoices([orders])[0]!.limit).toBe(1))

  it('applies both Orders picked', () =>
    expect(
      effectsWith('That unit can be affected by up to two different Orders at the same time.', ['Hold Fast!', 'Open Fire!']).map(
        (effect) => effect.toughness ?? effect.characteristic?.kind,
      ),
    ).toEqual([1, 'ballistic-skill']))

  it('adds the Order a unit always gets with any other', () =>
    expect(
      effectsWith('While the bearer is leading a unit, when that unit is issued an Order, it is also affected by the Hold Fast! Order.', [
        'Open Fire!',
      ]).map((effect) => effect.toughness ?? effect.characteristic?.kind),
    ).toEqual([1, 'ballistic-skill']))
})
