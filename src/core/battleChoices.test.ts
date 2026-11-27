import { describe, expect, it } from 'vitest'
import { allowancesWhile, battleChoiceActive, battleChoices, battleChoiceSheet, type StatedAllowance } from './battleChoices'
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

  it('names the keyword a unit needs before the army pick reaches it', () =>
    expect(
      battleChoices([
        rule(
          'In your Command phase, select one or more **ARMY** units from your army. Until the start of your next Command phase, those units gain the **CHOSEN FEW** keyword. Then, select one of the Gift abilities below. Until the start of your next Command phase, units from your army with the **CHOSEN FEW** keyword have the selected Gift ability:\n\n### Iron Skin\n\nAdd 1 to the Toughness characteristic of models in this unit.\n\n### Veil\n\nModels in this unit have the Stealth ability.',
        ),
      ])[0]!.selected,
    ).toBe('Chosen Few'))

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

  it('keeps a rule whose options change nothing a datasheet shows, so the pick is still noted', () =>
    expect(
      battleChoices([
        rule(
          'At the start of the battle round, you can select one of the Battle Stances below. Until the end of the battle round, that Battle Stance is active for your army, and all units from your army that have the Battle Stances ability gain the relevant abilities shown below.\n\n### HOLD STANCE\n\n■ Each time a model in this unit makes an attack, re-roll a Hit roll of 1.\n\n### ADVANCE STANCE\n\n■ Each time a model in this unit makes an attack, re-roll a Wound roll of 1.',
        ),
      ])[0]!.options.map((option) => option.label),
    ).toEqual(['Hold Stance', 'Advance Stance']))

  it('offers by name the options of a rule it cannot calculate', () =>
    expect(
      battleChoices([
        rule(
          'At the start of your Command phase, you can select one combat doctrine listed below. If you do, that combat doctrine is active for friendly units with this ability until the start of your next Command phase.\n\n### Assault Doctrine\n\nThis unit can shoot in a turn in which it Fell Back.\n\n### Tactical Doctrine\n\nThis unit can shoot and charge in a turn in which it Advanced.',
        ),
      ])[0],
    ).toMatchObject({
      armyWide: true,
      options: [
        { label: 'Assault Doctrine', effects: [] },
        { label: 'Tactical Doctrine', effects: [] },
      ],
    }))

  it('leaves out alternatives worded as a condition, which the player checks rather than picks', () =>
    expect(
      battleChoices([
        rule("This model's melee attacks have: ■ +1 Attacks. ■ Or: If this unit made a charge move this turn, +2 Attacks.", {
          scope: 'unit',
        }),
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
      baseValue: 'Ignores Cover',
      modifiers: ['Battle Stances'],
    }))

  it('keeps an ability something else added marked as added', () => {
    const granted = datasheetFixture({
      profiles: [
        {
          ...sheet.profiles[1]!,
          values: [{ name: 'Keywords', value: 'Pistol, Ignores Cover', baseValue: 'Pistol', modifiers: ['Omnispex'] }],
        },
      ],
    })
    expect(battleChoiceSheet(granted, active('Advance Stance')).profiles[0]!.values[0]!.baseValue).toBe('Pistol')
  })

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
  const choiceWith = (...stated: StatedAllowance[]) => battleChoices([orders], allowancesWhile(stated, true))[0]!
  const effectsWith = (stated: StatedAllowance, picked: string[]) => battleChoiceActive(choiceWith(stated), picked) ?? []
  const twoAtOnce: StatedAllowance = { options: 'Orders', limit: 2, leading: true }

  it('takes two Orders at once where another rule allows it', () => expect(choiceWith(twoAtOnce).limit).toBe(2))

  it('takes one Order where nothing allows more', () => expect(battleChoices([orders])[0]!.limit).toBe(1))

  it('adds an Order the unit selects itself to those its leader allows', () =>
    expect(choiceWith(twoAtOnce, { options: 'Orders', extra: 1 }).limit).toBe(3))

  it('ignores a leader allowance while the unit leads nothing', () =>
    expect(battleChoices([orders], allowancesWhile([twoAtOnce], false))[0]!.limit).toBe(1))

  it('applies both Orders picked', () =>
    expect(effectsWith(twoAtOnce, ['Hold Fast!', 'Open Fire!']).map((effect) => effect.toughness ?? effect.characteristic?.kind)).toEqual([
      1,
      'ballistic-skill',
    ]))

  it('adds the Order a unit always gets with any other', () =>
    expect(
      effectsWith({ options: 'Orders', also: 'Hold Fast!', leading: true }, ['Open Fire!']).map(
        (effect) => effect.toughness ?? effect.characteristic?.kind,
      ),
    ).toEqual([1, 'ballistic-skill']))
})
