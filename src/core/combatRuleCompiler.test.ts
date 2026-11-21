import { describe, expect, it } from 'vitest'
import { compileCombatRule } from './combatRuleCompiler'
import { combatReadingOf } from './combatReading'
import {
  combatDamageStateSelections,
  combatRuleAppliesTo,
  combatRuleChoices,
  combatRuleDefault,
  combatRuleRoles,
  type CombatRule,
  shownRuleChoices,
} from './combatRules'

const rule = (description: string, extra: Partial<CombatRule> = {}): CombatRule => ({
  id: 'buff',
  name: 'Buff',
  source: 'Source',
  scope: 'unit',
  models: 1,
  description,
  ...extra,
})
const effects = (description: string, extra: Partial<CombatRule> = {}) =>
  combatRuleChoices(rule(description, extra)).map((choice) => choice.effects)
const selectedPair =
  'Once per turn, in your Movement phase, when this model starts or ends a move, select one friendly Army Construct unit within 6" of this model (excluding Titanic units) and one enemy unit visible to this model. Until the start of your next Movement phase, weapons equipped by models in that friendly unit have the [Sustained Hits 1] ability while targeting that enemy unit.'

describe('damage states in a battle', () => {
  const damaged = [
    rule('While this model has 1-6 wounds remaining, each time this model makes an attack, subtract 1 from the Hit roll.', {
      id: 'damaged',
    }),
  ]
  const at = (wounds: number, damage: number, models = 1) => combatDamageStateSelections(damaged, { models, damage, wounds })
  it('switches the bracket on when the wounds left are inside it', () => expect(at(16, 12)).toEqual({ damaged: 1 }))
  it('reaches the top of the bracket', () => expect(at(16, 10)).toEqual({ damaged: 1 }))
  it('leaves the bracket off just above it', () => expect(at(16, 9)).toEqual({ damaged: 0 }))
  it('reads no bracket from a squad, whose wounds are spread over models', () => expect(at(16, 12, 2)).toEqual({}))
  it('leaves rules without a bracket to their default', () =>
    expect(combatDamageStateSelections([rule('This model has a 4+ invulnerable save.')], { models: 1, damage: 12, wounds: 16 })).toEqual(
      {},
    ))
})

describe('composed combat rules', () => {
  const magnaImperator =
    'When a friendly ADEPTUS CUSTODES unit is selected to attack, its attacks can re-roll one hit roll and one wound roll.'
  it('offers one hit and one wound re-roll in both phases to an eligible unit, on by default for a detachment', () => {
    const detachment = rule(magnaImperator, { scope: 'detachment', keywords: ['Adeptus Custodes'] })
    expect([combatRuleChoices(detachment), combatRuleDefault(detachment)]).toEqual([
      [{ label: 'Active', effects: [{ role: 'attacker', phases: ['ranged', 'melee'], options: { singleRerolls: ['hit', 'wound'] } }] }],
      1,
    ])
  })
  it('gives single-die re-rolls to no unit without the named keyword', () => {
    expect(effects(magnaImperator, { scope: 'detachment', keywords: ['Imperium'] })).toEqual([])
  })
  it('does not discard italicized combat instructions as flavour', () => {
    expect(
      compileCombatRule(
        rule(`If your Army Faction is ARMY, at the start of the first battle round, select one of the following Vows to be active for ARMY units from your army. While a Vow is active for your army, that unit has the associated ability below.

**Challenge**
*Inflict additional damage using an unknown mechanic.*

Each time a model in this unit makes a melee attack, add 1 to the Wound roll.`),
      ),
    ).toBeNull()
  })
  it('compiles dice-valued grants using the same keyword grammar as weapon profiles', () => {
    expect(effects('Ranged weapons equipped by models in this unit have the [SUSTAINED HITS D3] and [RAPID FIRE D6+3] abilities.')).toEqual(
      [
        [
          { role: 'attacker', phases: ['ranged'], keyword: 'SUSTAINED HITS D3' },
          { role: 'attacker', phases: ['ranged'], keyword: 'RAPID FIRE D6+3' },
        ],
      ],
    )
  })
  it.each(['bold', 'markdown'])('offers only damaging vows from %s headings without assuming a selection', (format) => {
    const heading = (name: string) => (format === 'bold' ? `**${name}**` : `### ${name}`)
    const description = `If your Army Faction is **ARMY,** at the start of the first battle round, select one of the following Vows to be active for **ARMY** units from your army. While a Vow is active for your army, that unit has the associated ability below.

${heading('Challenge')}
Each time a model in this unit makes a melee attack, if the Strength characteristic of that attack is less than or equal to the Toughness characteristic of the target, add 1 to the Wound roll.

${heading('Pursuit')}
You can re-roll the Charge roll.`
    expect(compileCombatRule(rule(description))).toEqual({
      defaultChoice: 0,
      choices: [
        {
          label: 'Challenge',
          option: 'Challenge',
          armyWide: true,
          effects: [{ role: 'attacker', phases: ['melee'], condition: 'not-stronger', options: { woundModifier: 1 } }],
        },
      ],
    })
  })
  it('offers each Order that changes an attack or a save as a choice', () => {
    const description = `If your Army Faction is **ARMY**, **OFFICER** with this ability can issue Orders. Each time one does, select one of the Orders below.

### MOVE! MOVE! MOVE!
Add 3" to the Move characteristic of models in this unit.

### TAKE AIM!
Improve the Ballistic Skill characteristic of ranged weapons equipped by models in this unit by 1.

### FIRST RANK, FIRE! SECOND RANK, FIRE!
Add 1 to the Attacks characteristic of Rapid Fire weapons equipped by models in this unit.

### TAKE COVER!
Improve the Save characteristic of models in this unit by 1 (this cannot improve a model’s Save to better than 3+).`
    expect(compileCombatRule(rule(description))).toEqual({
      defaultChoice: 0,
      choices: [
        {
          label: 'Take Aim!',
          option: 'Take Aim!',
          effects: [{ role: 'attacker', phases: ['ranged'], characteristic: { kind: 'ballistic-skill', add: -1 } }],
        },
        {
          label: 'First Rank, Fire! Second Rank, Fire!',
          option: 'First Rank, Fire! Second Rank, Fire!',
          effects: [
            { role: 'attacker', phases: ['ranged'], requiresWeaponKeyword: 'Rapid Fire', characteristic: { kind: 'attacks', add: 1 } },
          ],
        },
        {
          label: 'Take Cover!',
          option: 'Take Cover!',
          effects: [{ role: 'defender', phases: ['ranged', 'melee'], improveSave: { by: 1, best: 3 } }],
        },
      ],
    })
  })
  it('refuses an unknown combat clause in a named choice', () => {
    expect(
      compileCombatRule(
        rule(`If your Army Faction is ARMY, at the start of the first battle round, select one of the following Vows to be active for ARMY units from your army. While a Vow is active for your army, that unit has the associated ability below.

**Challenge**
Each time a model in this unit makes a melee attack, add 1 to the Wound roll. Inflict additional damage in an unknown way.`),
      ),
    ).toBeNull()
  })
  it('refuses a Toughness bonus for models in an afflicted enemy unit rather than giving it to the attacker', () =>
    expect(
      compileCombatRule(
        rule(`If your Army Faction is ARMY, while an enemy unit is within Infection Range of one or more ARMY units from your army, it is Infected.

### INFECTION RANGE
Infection Range changes over the course of the battle: Infection Range cannot be greater than 12" after modifiers.

### INFECTED
During the Declare Battle Formations step, select one of the Plagues below. Until the end of the battle, while an enemy unit is Infected, subtract 1 from the Toughness characteristic of models in that unit, and that unit has the effect of your chosen Plague.

### Bloat
Add 1 to the Toughness characteristic of INFANTRY models in that unit.`),
      ),
    ).toBeNull())
  it.each(['bold', 'markdown'])('keeps enemy status and plague choices together with %s headings', (format) => {
    const heading = (name: string) => (format === 'bold' ? `**${name}**` : `### ${name}`)
    const description = `If your Army Faction is ARMY, while an enemy unit is within Infection Range of one or more ARMY units from your army, it is Infected.

${heading('INFECTION RANGE')}
1st Battle Round: Infection Range = 3"
2nd Battle Round: Infection Range = 6"
3rd Battle Round Onwards: Infection Range = 9"

Infection Range cannot be greater than 12" after modifiers.

${heading('INFECTED')}
During the Declare Battle Formations step, select one of the Plagues below. Until the end of the battle, while an enemy unit is Infected, subtract 1 from the Toughness characteristic of models in that unit, and that unit has the effect of your chosen Plague.

${heading('Confusion')}
Each time a model in this unit makes a ranged attack, enemy units have the benefit of cover against that attack.
Each time a model in this unit makes a melee attack, subtract 1 from the Hit roll.

${heading('Brittleness')}
Worsen the Save characteristic of models in this unit by 1.

${heading('Sluggishness')}
Worsen the Move, Leadership and Objective Control characteristics of models in this unit by 1 (this rule can only worsen a model's Objective Control characteristic to a minimum of 1).`
    expect(compileCombatRule(rule(description))).toEqual({
      defaultChoice: 0,
      choices: [
        {
          label: 'Opponent infected · Confusion',
          option: 'Opponent infected · Confusion',
          effects: [
            { role: 'attacker', phases: ['ranged', 'melee'], targetToughness: -1 },
            { role: 'defender', phases: ['ranged'], options: { cover: true } },
            { role: 'defender', phases: ['melee'], options: { hitModifier: -1 } },
          ],
        },
        {
          label: 'Opponent infected · Brittleness',
          option: 'Opponent infected · Brittleness',
          effects: [
            { role: 'attacker', phases: ['ranged', 'melee'], targetToughness: -1 },
            { role: 'attacker', phases: ['ranged', 'melee'], targetSaveModifier: 1 },
          ],
        },
        {
          label: 'Opponent infected · Sluggishness',
          option: 'Opponent infected · Sluggishness',
          effects: [{ role: 'attacker', phases: ['ranged', 'melee'], targetToughness: -1 }],
        },
      ],
    })
  })
  it('keeps an activated named weapon replacement and its abilities together', () => {
    const buff = rule(
      'Once per battle, when this model is selected to shoot, it can use this ability. If it does, until the end of the phase, its Rifle weapon has a Damage characteristic of 3 and the [ANTI-INFANTRY 5+] and [DEVASTATING WOUNDS] abilities.',
    )
    expect(compileCombatRule(buff)).toEqual({
      defaultChoice: 0,
      choices: [
        {
          label: 'Ability activated',
          effects: [
            { role: 'attacker', phases: ['ranged'], weapon: 'Rifle', characteristic: { kind: 'damage', set: 3 } },
            { role: 'attacker', phases: ['ranged'], weapon: 'Rifle', keyword: 'ANTI-INFANTRY 5+' },
            { role: 'attacker', phases: ['ranged'], weapon: 'Rifle', keyword: 'DEVASTATING WOUNDS' },
          ],
        },
      ],
    })
  })
  it('retains range and existing-ability requirements on a critical-hit upgrade', () => {
    expect(
      compileCombatRule(
        rule(
          'Until the end of the phase, ranged weapons equipped by models in your unit have the [SUSTAINED HITS 1] ability while targeting an enemy unit within 12". If such a weapon already has that ability, until the end of the phase, each time an attack is made with that weapon, an unmodified Hit roll of 5+ scores a Critical Hit.',
          { scope: 'stratagem' },
        ),
      ),
    ).toEqual({
      defaultChoice: 0,
      choices: [
        {
          label: 'Target within 12"',
          effects: [
            { role: 'attacker', phases: ['ranged'], keyword: 'SUSTAINED HITS 1' },
            { role: 'attacker', phases: ['ranged'], requiresWeaponKeyword: 'SUSTAINED HITS 1', criticalHit: 5 },
          ],
        },
      ],
    })
  })
  it('refuses a named-weapon replacement with an unknown additional ability', () => {
    expect(compileCombatRule(rule('Its Rifle weapon has a Damage characteristic of 3 and the [UNSUPPORTED] ability.'))).toBeNull()
  })
  it('gives cover to the source unit and requires obscuration for other recipients', () => {
    const description =
      'Until the end of the phase, each time an attack targets either your SMOKE unit, or a unit that is not fully visible to the attacking model because of one or more models in your SMOKE unit, the target has the benefit of cover against that attack (13.08).'
    expect([
      combatRuleChoices(rule(description, { keywords: ['Smoke'], scope: 'stratagem' })),
      combatRuleChoices(rule(description, { keywords: ['Infantry'], scope: 'stratagem' })),
    ]).toEqual([
      [{ label: 'Active', effects: [{ role: 'defender', phases: ['ranged'], options: { cover: true } }] }],
      [{ label: 'Obscured by the source unit', effects: [{ role: 'defender', phases: ['ranged'], options: { cover: true } }] }],
    ])
  })
  it('keeps an opponent decision on its named weapon and respective combat roles', () => {
    expect(
      effects(
        'Each time this model targets an enemy unit with its ray, your opponent must declare if that unit will stand firm or duck for cover:\n■ If it stands firm, when resolving attacks against that unit this phase, a successful unmodified Hit roll of 5+ scores a Critical Hit.\n■ If it ducks for cover, until the start of your next Shooting phase, each time a model in that unit makes an attack, subtract 1 from the Hit roll.',
      ),
    ).toEqual([
      [{ role: 'attacker', phases: ['ranged', 'melee'], weapon: 'ray', criticalHit: 5, criticalHitRequiresSuccess: true }],
      [{ role: 'defender', phases: ['ranged', 'melee'], options: { hitModifier: -1 } }],
    ])
  })
  it('treats an enemy status aura that improves AP as an attacking effect', () => {
    const buff = rule(
      'While an enemy unit is within 6" of this unit, it is weakened. While an enemy unit is weakened, each time an attack targets that unit, improve the Armour Penetration characteristic of that attack by 1. At the start of each phase, for each ARMY MONSTER unit from your army, that unit can suffer 3 mortal wounds. If it does, until the end of the phase, the range of that unit\'s Weakening Aura ability is increased to 9".',
    )
    expect([combatRuleDefault(buff), combatRuleChoices(buff)]).toEqual([
      0,
      [
        {
          label: 'Target within 6" (9" with the extended aura active)',
          effects: [{ role: 'attacker', phases: ['ranged', 'melee'], characteristic: { kind: 'armour-penetration', add: -1 } }],
        },
      ],
    ])
  })
  it('keeps objective-marker support conditional and recipient-specific', () => {
    const description =
      'Select one objective marker within 18" of your SUPPORT model. Until the end of the phase, weapons equipped by friendly ARMY models have the [IGNORES COVER] ability while targeting units within range of that objective marker.'
    expect([
      effects(description, { keywords: ['Army'], phases: ['ranged'] }),
      effects(description, { keywords: ['Other'], phases: ['ranged'] }),
    ]).toEqual([[[{ role: 'attacker', phases: ['ranged'], keyword: 'IGNORES COVER' }]], []])
  })
  it('retains a selected-target effect after its phase prefix', () => {
    expect(
      effects(
        'In your Shooting phase, after this model has shot, select one enemy unit hit by one or more of those attacks. Until the end of the phase, that unit cannot have the Benefit of Cover.',
      ),
    ).toEqual([[{ role: 'attacker', phases: ['ranged'], keyword: 'Ignores Cover' }]])
  })
  it('retains the target keyword and test condition on a selected enemy debuff', () => {
    expect(
      effects(
        "Once per turn, at the start of your opponent's Shooting phase, select one enemy VEHICLE unit visible to the bearer. That unit must take a Leadership test. Until the end of the phase, each time a model in that unit makes an attack, subtract 1 from the Hit roll and, if that Leadership test was failed, subtract 1 from the Wound roll as well.",
      ),
    ).toEqual([
      [{ role: 'defender', phases: ['ranged'], targetKeywords: ['VEHICLE'], options: { hitModifier: -1 } }],
      [
        { role: 'defender', phases: ['ranged'], targetKeywords: ['VEHICLE'], options: { hitModifier: -1 } },
        { role: 'defender', phases: ['ranged'], targetKeywords: ['VEHICLE'], options: { woundModifier: -1 } },
      ],
    ])
  })
  it('limits a once-per-battle weapon grant to the activated shooting phase', () => {
    const buff = rule(
      'Once per battle, when this unit is selected to shoot, until the end of the phase, ranged weapons equipped by this unit gain the [Ignores Cover] ability.',
    )
    expect([combatRuleDefault(buff), combatRuleChoices(buff).map((choice) => choice.effects)]).toEqual([
      0,
      [[{ role: 'attacker', phases: ['ranged'], keyword: 'Ignores Cover' }]],
    ])
  })
  it('keeps an explicit phase on an otherwise unrestricted attack bonus', () => {
    expect(effects('In your Shooting phase, each time a model in this unit makes an attack, add 1 to the Hit roll.')).toEqual([
      [{ role: 'attacker', phases: ['ranged'], options: { hitModifier: 1 } }],
    ])
  })
  it('keeps damage rerolls limited to the named target kind', () => {
    expect(
      effects('Each time this model makes a ranged attack that targets a MONSTER or VEHICLE unit, re-roll a Damage roll of 1.'),
    ).toEqual([[{ role: 'attacker', phases: ['ranged'], targetKeywords: ['MONSTER', 'VEHICLE'], damageReroll: 'ones' }]])
  })
  it('compiles a listed hit, wound and damage re-roll', () => {
    const target = { role: 'attacker', phases: ['ranged'], targetKeywords: ['MONSTER', 'VEHICLE'] } as const
    expect(
      effects(
        'In your Shooting phase, each time a model in this unit makes a ranged attack that targets a MONSTER or VEHICLE unit, you can re-roll the Hit roll, you can re-roll the Wound roll and you can re-roll the Damage roll.',
      ),
    ).toEqual([
      [
        { ...target, options: { hitReroll: 'failed' } },
        { ...target, options: { woundReroll: 'failed' } },
        { ...target, damageReroll: 'any' },
      ],
    ])
  })
  it('preserves the enclosing condition across all bullets', () => {
    const buff = rule(
      "While a PILOT model is embarked within this unit:\n- This unit's ranged attacks have [Ignores Cover].\n- If this unit is empowered, this unit's ranged attacks have [Sustained Hits 1].",
    )
    expect([combatRuleDefault(buff), combatRuleChoices(buff)]).toEqual([
      0,
      [
        {
          label: 'A PILOT model is embarked within this unit',
          effects: [{ role: 'attacker', phases: ['ranged'], keyword: 'Ignores Cover' }],
        },
        {
          label: 'A PILOT model is embarked within this unit · This unit is empowered',
          effects: [
            { role: 'attacker', phases: ['ranged'], keyword: 'Ignores Cover' },
            { role: 'attacker', phases: ['ranged'], keyword: 'Sustained Hits 1' },
          ],
        },
      ],
    ])
  })
  it('retains an upgraded reroll after a semicolon', () => {
    expect(
      effects(
        'Each time this unit makes a melee attack, re-roll a Wound roll of 1 if this unit is below its Starting Strength; if this unit is Below Half-strength, you can re-roll the Wound roll instead.',
      ),
    ).toEqual([
      [{ role: 'attacker', phases: ['melee'], options: { woundReroll: 'ones' } }],
      [{ role: 'attacker', phases: ['melee'], options: { woundReroll: 'failed' } }],
    ])
  })
  it.each([
    'Each time a model in this unit makes an attack, add 1 to the Hit roll if this unit is below its Starting Strength, and add 1 to the Wound roll as well if this unit is Below Half-strength.',
    'Each time a model in this unit makes an attack, add 1 to the Hit roll if this unit is below its Starting Strength, and add 1 to the Wound roll, as well, if this unit is Below Half-strength.',
  ])('adds a bonus given "as well" only alongside the first: %s', (description) => {
    expect(effects(description)).toEqual([
      [{ role: 'attacker', phases: ['ranged', 'melee'], options: { hitModifier: 1 } }],
      [
        { role: 'attacker', phases: ['ranged', 'melee'], options: { hitModifier: 1 } },
        { role: 'attacker', phases: ['ranged', 'melee'], options: { woundModifier: 1 } },
      ],
    ])
  })
  it('recognizes an activated phase ability without making it passive', () => {
    const buff = rule(
      'Once per battle, in the Fight phase, this model can use this ability. If it does, until the end of the phase, improve the Strength and Attacks characteristics of melee weapons equipped by this model by 3.',
    )
    expect([combatRuleDefault(buff), combatRuleChoices(buff).map((choice) => choice.effects)]).toEqual([
      0,
      [
        [
          { role: 'attacker', phases: ['melee'], characteristic: { kind: 'strength', add: 3 } },
          { role: 'attacker', phases: ['melee'], characteristic: { kind: 'attacks', add: 3 } },
        ],
      ],
    ])
  })
  it('recognizes a weapon grant to a whole unit while leading', () => {
    expect(
      effects('While this model is leading a unit, melee weapons equipped by that unit have the [SUSTAINED HITS 1] ability.', {
        scope: 'attached',
        models: 5,
      }),
    ).toEqual([[{ role: 'attacker', phases: ['melee'], keyword: 'SUSTAINED HITS 1' }]])
  })
  it('combines a save and FNP sharing the same subject', () => {
    expect(effects('The bearer has a Save characteristic of 2+ and the Feel No Pain 5+ ability.')).toEqual([
      [
        { role: 'defender', phases: ['ranged', 'melee'], save: 2 },
        { role: 'defender', phases: ['ranged', 'melee'], feelNoPain: 5 },
      ],
    ])
  })
  it('retains the restriction on abbreviated target bonuses', () => {
    expect(effects("Your unit's attacks that target a MONSTER/VEHICLE unit have +1 to wound rolls.")).toEqual([
      [{ role: 'attacker', phases: ['ranged', 'melee'], targetKeywords: ['MONSTER', 'VEHICLE'], options: { woundModifier: 1 } }],
    ])
  })
  it('compiles a comma-separated list of target keywords', () => {
    expect(
      effects(
        'Each time this model makes an attack that targets a CHARACTER, MONSTER or WALKER unit, you can re-roll the Hit roll and re-roll the Wound roll.',
      ),
    ).toEqual([
      [
        {
          role: 'attacker',
          phases: ['ranged', 'melee'],
          targetKeywords: ['CHARACTER', 'MONSTER', 'WALKER'],
          options: { hitReroll: 'failed' },
        },
        {
          role: 'attacker',
          phases: ['ranged', 'melee'],
          targetKeywords: ['CHARACTER', 'MONSTER', 'WALKER'],
          options: { woundReroll: 'failed' },
        },
      ],
    ])
  })
  it('keeps a friendly selected-to-shoot condition recipient-specific', () => {
    const description =
      "Friendly SCOUT units have Deep Strike. When a friendly SCOUT unit is selected to shoot, if that unit made an ingress move this turn, that unit's ranged attacks have +1 to hit rolls."
    expect([effects(description, { keywords: ['Scout'] }), effects(description, { keywords: ['Vehicle'] })]).toEqual([
      [[{ role: 'attacker', phases: ['ranged'], options: { hitModifier: 1 } }]],
      [],
    ])
  })
  it('compiles a named stance choice without combining alternatives', () => {
    expect(
      effects(
        'Each time a unit with this ability is selected to fight, select one of the stances below. Until that unit has finished making its attacks, the selected Stance is active for it and it gains the relevant ability.\n\n■ FIRST STANCE\nMelee weapons equipped by models in this unit have the [SUSTAINED HITS 1] ability.\n■ SECOND STANCE\nMelee weapons equipped by models in this unit have the [LETHAL HITS] ability.',
      ),
    ).toEqual([
      [{ role: 'attacker', phases: ['melee'], keyword: 'SUSTAINED HITS 1' }],
      [{ role: 'attacker', phases: ['melee'], keyword: 'LETHAL HITS' }],
    ])
  })
  it('keeps a selected weapon ability behind its ingress condition', () => {
    const buff = rule(
      "When this unit is selected to shoot, if this unit was set up using a portal this turn, this unit's ranged attacks have:\n- [Lethal Hits].\n- Or: [Sustained Hits 1].",
    )
    expect([combatRuleDefault(buff), combatRuleChoices(buff).map((choice) => choice.effects)]).toEqual([
      0,
      [
        [{ role: 'attacker', phases: ['ranged'], keyword: 'Lethal Hits' }],
        [{ role: 'attacker', phases: ['ranged'], keyword: 'Sustained Hits 1' }],
      ],
    ])
  })
  it('does not discard an unknown rider on a named alternative', () => {
    expect(
      effects(
        'Each time a unit with this ability is selected to fight, select one of the stances below. Until that unit has finished making its attacks, the selected Stance is active for it and it gains the relevant ability.\n\n■ FIRST STANCE\nMelee weapons equipped by models in this unit have the [LETHAL HITS] ability.\n■ SECOND STANCE\nInflict 3 mortal wounds.',
      ),
    ).toEqual([])
  })
  it('limits a selected friendly shooting buff to that phase', () => {
    expect(
      effects(
        'In your Shooting phase, select one friendly ARMY unit within 6" of this model. Until the end of the phase, each time a model in that unit makes an attack, add 1 to the Hit roll.',
        { keywords: ['Army'], scope: 'nearby' },
      ),
    ).toEqual([[{ role: 'attacker', phases: ['ranged'], options: { hitModifier: 1 } }]])
  })
  it('requires activation of a selected friendly and enemy pair for both attack phases', () => {
    expect(compileCombatRule(rule(selectedPair, { keywords: ['Army', 'Construct'], scope: 'nearby' }))).toEqual({
      defaultChoice: 0,
      choices: [
        {
          label: 'Selected within 6" · Against the selected target',
          effects: [{ role: 'attacker', phases: ['ranged', 'melee'], keyword: 'Sustained Hits 1' }],
        },
      ],
    })
  })
  it.each([['Army'], ['Construct'], ['Army', 'Construct', 'Titanic']])(
    'excludes an ineligible selected recipient with keywords %j',
    (...keywords) => {
      expect(compileCombatRule(rule(selectedPair, { keywords }))).toEqual({ choices: [], defaultChoice: 0 })
    },
  )
  it('does not offer a selected offensive grant as a defending rule', () => {
    expect(combatRuleAppliesTo(rule(selectedPair, { keywords: ['Army', 'Construct'] }), 'defender')).toBe(false)
  })
  it('keeps the recipient restriction explicit when its keywords are unknown', () => {
    expect(combatRuleChoices(rule(selectedPair))[0]?.label).toContain('For Army Construct unit (excluding Titanic units)')
  })
  it('does not discard an unknown rider after a selected pair grant', () => {
    expect(
      compileCombatRule(rule(`${selectedPair} Inflict additional damage using an unknown mechanic.`, { keywords: ['Army', 'Construct'] })),
    ).toBeNull()
  })
  it('compiles different selected-pair weapon grants and ranges without rule-name matching', () => {
    expect(
      effects(selectedPair.replace('6"', '9"').replace('Sustained Hits 1', 'Lethal Hits'), { keywords: ['Army', 'Construct'] }),
    ).toEqual([[{ role: 'attacker', phases: ['ranged', 'melee'], keyword: 'Lethal Hits' }]])
  })
  it('limits a once-per-battle fight activation to melee', () => {
    expect(
      effects(
        'Once per battle, at the start of the Fight phase, this model can use this ability. If it does, until the end of the phase, each time this model makes an attack, add 1 to the Hit roll.',
      ),
    ).toEqual([[{ role: 'attacker', phases: ['melee'], options: { hitModifier: 1 } }]])
  })
  it('does not apply a scoped damage reduction globally', () => {
    expect(
      effects(
        'While an enemy unit (excluding VEHICLES) is within 6" of this model, each time an attack targets this unit, subtract 1 from the Damage characteristic of that attack.',
      ),
    ).toEqual([])
  })
  it('keeps a declared battlefield region as an explicit reroll condition', () => {
    expect(
      effects(
        "Certain areas of the battlefield are considered to be within your army's Defence Network, as follows: ■ Your deployment zone is always within your army's Defence Network. ■ At the start of any phase, if you control at least half of the objective markers within No Man's Land, until the end of that phase, No Man's Land is within your army's Defence Network. Each time a model in a SOLDIER unit from your army makes an attack, re-roll a Hit roll of 1. If such a unit is wholly within your army's Defence Network, you can re-roll the Hit roll instead.",
        { keywords: ['Soldier'] },
      ),
    ).toEqual([
      [{ role: 'attacker', phases: ['ranged', 'melee'], options: { hitReroll: 'ones' } }],
      [{ role: 'attacker', phases: ['ranged', 'melee'], options: { hitReroll: 'failed' } }],
    ])
  })
  it('does not hide FNP when the same rule already changed the armour save', () => {
    expect(
      effects('The bearer has a Save characteristic of 2+. The bearer has the Feel No Pain 5+ ability.', { appliedDefences: ['save'] }),
    ).toEqual([[{ role: 'defender', phases: ['ranged', 'melee'], feelNoPain: 5 }]])
  })
  it('does not activate a conditional bonus after removing an applied defence', () => {
    const buff = rule(
      'The bearer has a Save characteristic of 2+. While this unit is on the battlefield, the bearer has the Feel No Pain 5+ ability.',
      { appliedDefences: ['save'] },
    )
    expect(combatRuleChoices(buff)[combatRuleDefault(buff) - 1]?.effects).toEqual([])
  })
  it('interprets selected weapon ability alternatives with recipient keywords', () => {
    expect(
      combatRuleChoices(
        rule(
          'In your Shooting phase, each time a SCIENTIST unit from your army is selected to shoot, select one of the following abilities: [ANTI-INFANTRY 3+], [HEAVY], [IGNORES COVER]. Until the end of the phase, ranged weapons equipped by models in that unit have that ability.',
          { keywords: ['Scientist'] },
        ),
      ).map((choice) => choice.effects),
    ).toEqual([
      [{ role: 'attacker', phases: ['ranged'], keyword: 'ANTI-INFANTRY 3+' }],
      [{ role: 'attacker', phases: ['ranged'], keyword: 'HEAVY' }],
      [{ role: 'attacker', phases: ['ranged'], keyword: 'IGNORES COVER' }],
    ])
  })
  it('supports ignore-modifier lists and a recipient-restricted extra effect', () => {
    expect(
      effects(
        "Each time a model in your unit makes an attack, you can ignore any or all modifiers to the following: that attack's Ballistic Skill or Weapon Skill characteristic; the Hit roll. If your unit has the SCIENTIST keyword, you can also ignore any or all modifiers to the Wound roll.",
        { keywords: ['Scientist'] },
      ),
    ).toEqual([
      [
        { role: 'attacker', phases: ['ranged', 'melee'], ignoreSkillModifiers: true, ignoreHitModifiers: true },
        { role: 'attacker', phases: ['ranged', 'melee'], ignoreWoundModifiers: true },
      ],
    ])
  })
  it('keeps an enemy aura debuff on the defending side', () => {
    expect(
      effects(
        'While an enemy unit is within 6" of this model, each time a model in that unit makes a melee attack, subtract 1 from the Hit roll.',
      ),
    ).toEqual([[{ role: 'defender', phases: ['melee'], options: { hitModifier: -1 } }]])
  })
  it('compiles army keyword restrictions without enabling them for other units', () => {
    expect(
      effects('Each time a SOLDIER or SCIENTIST unit from your army makes an attack, add 1 to the Wound roll.', { keywords: ['Vehicle'] }),
    ).toEqual([])
  })
  it('supports a save and a movement characteristic without losing the save', () => {
    expect(effects('The bearer has a Save characteristic of 3+ and a Move characteristic of 8".')).toEqual([
      [{ role: 'defender', phases: ['ranged', 'melee'], save: 3 }],
    ])
  })
  it('keeps separate attack and defence modifiers on their own sides', () => {
    expect(
      effects(
        'Each time an attack targets this unit, subtract 1 from the Hit roll. Each time this model makes a melee attack, add 1 to the Hit roll.',
      ),
    ).toEqual([
      [
        { role: 'defender', phases: ['ranged', 'melee'], options: { hitModifier: -1 } },
        { role: 'attacker', phases: ['melee'], options: { hitModifier: 1 } },
      ],
    ])
  })
  it('combines hit and wound rerolls under the same attack scope', () => {
    expect(
      effects('Each time this model makes a ranged attack, you can re-roll the Hit roll and you can re-roll a Wound roll of 1.'),
    ).toEqual([
      [
        { role: 'attacker', phases: ['ranged'], options: { hitReroll: 'failed' } },
        { role: 'attacker', phases: ['ranged'], options: { woundReroll: 'ones' } },
      ],
    ])
  })
  it('grants multiple weapon abilities without adding movement-only abilities', () => {
    expect(
      effects('Ranged weapons equipped by models in this unit have the [LETHAL HITS], [SUSTAINED HITS 1] and [ASSAULT] abilities.'),
    ).toEqual([
      [
        { role: 'attacker', phases: ['ranged'], keyword: 'LETHAL HITS' },
        { role: 'attacker', phases: ['ranged'], keyword: 'SUSTAINED HITS 1' },
      ],
    ])
  })
  it('replaces an unconditional FNP with its conditional upgrade', () => {
    expect(
      effects(
        'This model has the Feel No Pain 5+ ability. While this model is within range of an objective marker, this model has the Feel No Pain 4+ ability instead.',
      ),
    ).toEqual([
      [{ role: 'defender', phases: ['ranged', 'melee'], feelNoPain: 5 }],
      [{ role: 'defender', phases: ['ranged', 'melee'], feelNoPain: 4 }],
    ])
  })
  it('keeps conditional upgrades off by default', () => {
    expect(
      combatRuleDefault(
        rule('While this unit is Below Half-strength, each time a model in this unit makes an attack, add 1 to the Wound roll.'),
      ),
    ).toBe(0)
  })
  it('selects mutually exclusive attack and defence stances', () => {
    expect(
      effects(
        'At the start of the Fight phase, select one of the following: ■ Each time this model makes an attack, add 1 to the Hit roll. ■ Each time an attack targets this unit, subtract 1 from the Hit roll.',
      ),
    ).toEqual([
      [{ role: 'attacker', phases: ['melee'], options: { hitModifier: 1 } }],
      [{ role: 'defender', phases: ['melee'], options: { hitModifier: -1 } }],
    ])
  })
  it('requires every recipient keyword and honors exclusions', () => {
    expect(
      effects(
        'While a friendly ARMY INFANTRY unit (excluding SCOUTS) is within 6" of this model, each time a model in that unit makes an attack, re-roll a Hit roll of 1.',
        { scope: 'nearby', keywords: ['Army', 'Infantry', 'Scouts'] },
      ),
    ).toEqual([])
  })
  it('allows either eligible recipient with an explicit range condition', () => {
    expect(
      combatRuleChoices(
        rule(
          'While a friendly ARMY INFANTRY or ARMY MOUNTED unit is within 6" of this model, each time a model in that unit makes an attack, re-roll a Hit roll of 1.',
          { scope: 'nearby', keywords: ['Army', 'Mounted'] },
        ),
      ),
    ).toEqual([{ label: 'Within 6"', effects: [{ role: 'attacker', phases: ['ranged', 'melee'], options: { hitReroll: 'ones' } }] }])
  })
  it('preserves named weapons and target keywords for per-weapon resolution', () => {
    expect(
      effects('Each time this model makes a ranged attack with its rifle that targets a VEHICLE unit, add 1 to the Wound roll.'),
    ).toEqual([[{ role: 'attacker', phases: ['ranged'], weapon: 'rifle', targetKeywords: ['VEHICLE'], options: { woundModifier: 1 } }]])
  })
  it('compiles successful critical hit wording separately from automatic critical hits', () => {
    expect(effects('Each time this model makes an attack, a successful unmodified Hit roll of 5+ scores a Critical Hit.')).toEqual([
      [{ role: 'attacker', phases: ['ranged', 'melee'], criticalHit: 5, criticalHitRequiresSuccess: true }],
    ])
  })
  it('evaluates strength-dependent wound penalties per attack', () => {
    expect(
      effects(
        'Each time an attack targets this unit, if the Strength characteristic of that attack is greater than the Toughness characteristic of this unit, subtract 1 from the Wound roll.',
      ),
    ).toEqual([[{ role: 'defender', phases: ['ranged', 'melee'], condition: 'stronger', options: { woundModifier: -1 } }]])
  })
  it('supports armour penetration only on critical wounds', () => {
    expect(
      effects(
        'Each time this model makes an attack, on a Critical Wound, improve the Armour Penetration characteristic of that attack by 1.',
      ),
    ).toEqual([
      [
        {
          role: 'attacker',
          phases: ['ranged', 'melee'],
          condition: 'critical-wound',
          characteristic: { kind: 'armour-penetration', add: -1 },
        },
      ],
    ])
  })
  it('does not turn an unknown dice condition into a manual buff', () => {
    expect(effects('Each time this model makes an attack, if the unmodified Hit roll is 4, add 1 to the Wound roll.')).toEqual([])
  })
  it('refuses a supported effect followed by an unsupported effect', () => {
    expect(
      effects(
        'This model has a 4+ invulnerable save. Each time this model is destroyed, return it to the battlefield with D3 wounds remaining.',
      ),
    ).toEqual([])
  })
  it('filters a movement-only weapon grant out of both combat roles', () => {
    const buff = rule('Ranged weapons equipped by models in this unit have the [ASSAULT] ability.')
    expect(['attacker', 'defender'].map((role) => combatRuleAppliesTo(buff, role as 'attacker' | 'defender'))).toEqual([false, false])
  })
  it('fails closed for unsupported conditional defence mechanics', () => {
    expect(
      compileCombatRule(
        rule(
          'Each time an attack targets this unit, if the Strength characteristic of that attack is greater than the Toughness characteristic of this unit, halve the Damage characteristic of that attack.',
        ),
      ),
    ).toBeNull()
  })
})

describe('shorthand transcriptions', () => {
  const labels = (description: string, extra: Partial<CombatRule> = {}) =>
    combatRuleChoices(rule(description, extra)).map((choice) => choice.label)
  it('offers each ability of an either-or grant as its own choice', () =>
    expect(
      labels('When a friendly unit is selected to fight, its melee attacks have [SUSTAINED HITS 1] or [LETHAL HITS] (choose one).'),
    ).toEqual(['SUSTAINED HITS 1', 'LETHAL HITS']))
  it('reads bulleted alternatives that follow their selection without a colon', () =>
    expect(
      effects(
        "At the start of any phase, you can select one of the following to take effect until the end of the phase\n- This model's Big Axe weapon has +3 A\n- This model has 3+ InSv",
      ),
    ).toEqual([
      [{ role: 'attacker', phases: ['ranged', 'melee'], weapon: 'Big Axe', characteristic: { kind: 'attacks', add: 3 } }],
      [{ role: 'defender', phases: ['ranged', 'melee'], invulnerable: 3 }],
    ]))
  it('applies every characteristic of a listed bonus', () =>
    expect(effects('Melee attacks have +1 A, +1 S and +1 D.')[0]!.map((effect) => effect.characteristic?.kind)).toEqual([
      'attacks',
      'strength',
      'damage',
    ]))
  it('makes listed alternatives one condition the player confirms', () =>
    expect(
      labels(
        "This unit's attacks have [LETHAL HITS] if any of the following apply:\n- This unit is on an objective\n- The target is on an objective",
      ),
    ).toEqual(['This unit is on an objective or The target is on an objective']))
  it('limits a quarry bonus to the selected target', () =>
    expect(
      labels(
        "At the start of the first battle round, select one enemy unit to be this model's mark.\n- This model's attacks that target this model's mark have +1 to wound rolls\n- Each time this model's mark is destroyed, select one enemy unit to be this model's mark.",
      ),
    ).toEqual(['Against the selected target']))
  it('reads re-rolls granted to a unit’s attacks under a condition', () =>
    expect(effects("While this unit is below half-strength, this unit's melee attacks can re-roll wound rolls.")).toEqual([
      [{ role: 'attacker', phases: ['melee'], options: { woundReroll: 'failed' } }],
    ]))
  it('keeps the other effects of a rule that lowers the critical threshold instead of the default', () =>
    expect(
      effects(
        'Weapons equipped by models in this unit have the [LETHAL HITS] ability. In addition, each time a model in this unit makes an attack, a Critical Hit is scored on an unmodified Hit roll of 5+, instead of only a 6.',
      ),
    ).toEqual([
      [
        { role: 'attacker', phases: ['ranged', 'melee'], keyword: 'LETHAL HITS' },
        { role: 'attacker', phases: ['ranged', 'melee'], criticalHit: 5 },
      ],
    ]))
  it("keeps a bonus to the bearer's melee weapons off its ranged weapons", () =>
    expect(effects("Improve the Armour Penetration characteristic of the bearer's melee weapons by 1.")).toEqual([
      [{ role: 'attacker', phases: ['melee'], characteristic: { kind: 'armour-penetration', add: -1 } }],
    ]))
  it('requires the ability a weapon is named by instead of a weapon with that name', () =>
    expect(
      effects('Each time this model makes an attack with a Lethal Hits weapon, an unmodified Hit roll of 5+ scores a Critical Hit.'),
    ).toEqual([[{ role: 'attacker', phases: ['ranged', 'melee'], requiresWeaponKeyword: 'Lethal Hits', criticalHit: 5 }]]))
  it('refuses a condition that runs on into a list of effects', () =>
    expect(
      effects(
        'While this unit is near a transport:\nModels in this unit have the Stealth ability\nEach time a ranged attack targets this unit, models in that unit have the Benefit of Cover against that attack.',
      ),
    ).toEqual([]))
  it('matches a unit by any keyword in a comma-separated list', () =>
    expect(
      labels('Each time a NOBLE, LYCHGUARD or TRIARCH unit from your army makes an attack, add 1 to the Wound roll.', {
        keywords: ['Lychguard'],
      }),
    ).toEqual(['Active']))
})

describe('wordings a rule gives a whole army or a keyword', () => {
  const melee = (kind: 'strength' | 'armour-penetration', add: number) => ({
    role: 'attacker',
    phases: ['melee'],
    characteristic: { kind, add },
  })

  it('reads an ability granted to the army, used after a charge, past the limits on what it may target', () =>
    expect(
      combatRuleChoices(
        rule(
          '**HOST** units from your army have the following ability:\n\n**Grand Entrance:** Each time this unit is selected to fight, if this unit made a Charge move this turn, it can use this ability. If it does, until the end of the phase:\n\n■ This unit cannot target a unit it was within Engagement Range of at the start of the turn.\n■ Improve the Strength and Armour Penetration characteristics of this unit’s melee weapons by 1.',
          { scope: 'detachment', keywords: ['Host'] },
        ),
      ),
    ).toEqual([{ label: 'Charged this turn · Ability activated', effects: [melee('strength', 1), melee('armour-penetration', -1)] }]))

  const wardens = (extra: Partial<CombatRule>) =>
    compileCombatRule(
      rule('While the bearer is leading a unit, each time a **WARDEN** model in that unit makes an attack, add 1 to the Hit roll.', {
        scope: 'attached',
        models: 10,
        ...extra,
      }),
    )

  it('gives a bonus for models with a keyword to a unit whose every model has it', () =>
    expect(wardens({ keywords: ['Warden'] })).toEqual({
      choices: [{ label: 'Active', effects: [{ role: 'attacker', phases: ['ranged', 'melee'], options: { hitModifier: 1 } }] }],
      defaultChoice: 1,
    }))

  it.each([
    ['only some of whose models have the keyword', { keywords: ['Warden'], partialKeywords: ['Warden'] }],
    ['that names its models without the keyword', { keywords: ['Herald'] }],
  ])('refuses a bonus for models with a keyword in a unit %s', (_, extra) => expect(wardens(extra)).toBeNull())

  it("adds Attacks only to the bearer's ranged weapons with a keyword", () =>
    expect(effects('Add 3 to the Attacks characteristic of ranged Psychic weapons equipped by the bearer.')).toEqual([
      [{ role: 'attacker', phases: ['ranged'], requiresWeaponKeyword: 'Psychic', characteristic: { kind: 'attacks', add: 3 } }],
    ]))

  it('ignores the modifiers a list names', () =>
    expect(effects('Your unit can ignore modifiers to your unit’s:\n\n- BS.\n- <b>Hit rolls</b> and <b>wound rolls</b>.')).toEqual([
      [
        {
          role: 'attacker',
          phases: ['ranged', 'melee'],
          ignoreSkillModifiers: true,
          ignoreHitModifiers: true,
          ignoreWoundModifiers: true,
        },
      ],
    ]))

  it.each([
    ['puts a unit in a state other rules ask for', 'While the bearer’s unit is on the battlefield, it is wholly within your army’s Veil.'],
    [
      'changes the rolls of attacks it cannot calculate',
      'Each time a **HOST** model from your army makes a Psychic Attack, re-roll a Wound roll of 1.',
    ],
  ])('reports a rule that %s', (_, description) => expect(combatRuleRoles(description)).toContain('attacker'))

  it.each([
    ['an attack aimed at it', 'Each time a model makes an attack that targets this model, subtract 1 from the Hit roll.'],
    [
      'an attack allocated to it',
      'Each time an attack with a Damage characteristic of 1 is allocated to a **WARDEN** model from your army, add 1 to any armour saving throw made against that attack.',
    ],
    [
      'a failed saving throw',
      'Once per turn, the first time a saving throw is failed for the bearer, change the Damage characteristic of that attack to 0.',
    ],
  ])('reads %s as a defence alone', (_, description) => expect(combatRuleRoles(description)).toEqual(['defender']))
})

describe('rules a unit switches between during the battle', () => {
  const routines = (bullet: string, name: (written: string) => string) =>
    `At the start of the battle, if this model is leading a unit, that unit enters Guard Routine (see below). In your Command phase, if this model is leading a unit, you can select one routine from those listed below for that unit to enter. Once a unit enters a routine, it remains in that routine until it enters a different one.\n${bullet} ${name('Strike Routine')} Add 2 to the Attacks characteristic of ranged weapons equipped by **WAR ENGINE** models in this unit.\n${bullet} ${name('Guard Routine')} Add 1 to the Toughness characteristic of **WAR ENGINE** models in this unit.`

  it.each([
    ['a datacard', routines('■', (name) => `**${name}:**`)],
    ['a catalogue', routines('-', (name) => `${name}:`)],
  ])('offers each routine %s lists as a choice', (_, description) =>
    expect(combatRuleChoices(rule(description, { keywords: ['War Engines'] }))).toEqual([
      { label: 'Strike Routine', effects: [{ role: 'attacker', phases: ['ranged'], characteristic: { kind: 'attacks', add: 2 } }] },
      { label: 'Guard Routine', effects: [{ role: 'defender', phases: ['ranged', 'melee'], toughness: 1 }] },
    ]),
  )

  it('refuses a list with a line that is not one of its options', () =>
    expect(
      compileCombatRule(rule(`${routines('-', (name) => `${name}:`)}\nThis unit cannot change routine twice in one battle round.`)),
    ).toBeNull())

  it('shows a granted ability that changes no roll on a datasheet', () =>
    expect(shownRuleChoices(rule('Ranged weapons equipped by models in this unit have the **[ASSAULT]** ability.'))).toEqual([
      { label: 'Active', effects: [{ role: 'attacker', phases: ['ranged'], keyword: 'ASSAULT' }] },
    ]))

  it('shows a granted ability that changes no roll on a datasheet that holds only the recorded reading', () => {
    const written = rule('Ranged weapons equipped by models in this unit have the **[ASSAULT]** ability.')
    expect(shownRuleChoices({ ...written, description: '', reading: combatReadingOf(written) })).toEqual([
      { label: 'Active', effects: [{ role: 'attacker', phases: ['ranged'], keyword: 'ASSAULT' }] },
    ])
  })
})

describe('Haloscreed Battleclade rules', () => {
  const kastelanRobots = ['Faction: Adeptus Mechanicus', 'Imperium', 'Kastelan Robots', 'Legio Cybernetica', 'Vehicle', 'Walker']
  const battleProtocols =
    'At the start of the battle, if this model is leading a **KASTELAN ROBOTS** unit, that unit enters Aegis Protocols (see below). In your Command phase, if this model is leading a **KASTELAN ROBOTS** unit, you can select one protocol from those listed below for that unit to enter. Once a unit enters a protocol, it remains in that protocol until it enters a different one.\n\n■ **Protector Protocol:** Add 2 to the Attacks characteristic of ranged weapons equipped by **KASTELAN ROBOT** models in that unit.\n■ **Conqueror Protocol:** Add 2 to the Attacks characteristic of melee weapons equipped by **KASTELAN ROBOT** models in that unit.\n■ **Aegis Protocol:** Add 1 to the Toughness characteristic of **KASTELAN ROBOT** models in that unit.'
  const noosphericTransference =
    'In your Command phase, select one or more **ADEPTUS MECHANICUS** units from your army (including units that are embarked within **TRANSPORTS**). The maximum number of units you can select depends on the battle size, as follows:\n\nINCURSION: 1 UNIT\nSTRIKE FORCE: 2 UNITS\nONSLAUGHT: 3 UNITS\n\nUntil the start of your next Command phase, those units gain the **HALO OVERRIDE** keyword. Then, select one of the Override abilities below. Until the start of your next Command phase, units from your army with the **HALO OVERRIDE** keyword have the selected Override ability:\n\n### Electromotive Energisation\n\nAdd 2" to the Move characteristic of models in this unit.\n\n### Microactuator Bracing\n\nAdd 1 to the Toughness characteristic of models in this unit.\n\n### Predation Protocols\n\nThis unit is eligible to declare a charge in a turn in which it Advanced.\n\n### Muted Servomotors\n\nModels in this unit have the Stealth ability.'

  it("reads a unit's ranged attacks re-rolling Damage rolls", () =>
    expect(effects('This unit’s ranged attacks can re-roll <b>damage rolls</b>.')).toEqual([
      [{ role: 'attacker', phases: ['ranged'], damageReroll: 'any' }],
    ]))
  it('reads more range and a Hazardous re-roll as changing no attack', () =>
    expect(
      compileCombatRule(
        rule(
          '**ADEPTUS MECHANICUS** model only. Add 6" to the range characteristic of ranged weapons equipped by models in the bearer’s unit and, each time a Hazardous test is taken for that unit, you can re‑roll the result.',
        ),
      ),
    ).toEqual({ choices: [], defaultChoice: 0 }))
  it('offers each protocol the unit can enter', () =>
    expect(combatRuleChoices(rule(battleProtocols, { scope: 'attached', keywords: kastelanRobots, models: 2 }))).toEqual([
      { label: 'Protector Protocol', effects: [{ role: 'attacker', phases: ['ranged'], characteristic: { kind: 'attacks', add: 2 } }] },
      { label: 'Conqueror Protocol', effects: [{ role: 'attacker', phases: ['melee'], characteristic: { kind: 'attacks', add: 2 } }] },
      { label: 'Aegis Protocol', effects: [{ role: 'defender', phases: ['ranged', 'melee'], toughness: 1 }] },
    ]))
  it('starts in the protocol the unit enters at the start of the battle', () =>
    expect(combatRuleDefault(rule(battleProtocols, { scope: 'attached', keywords: kastelanRobots, models: 2 }))).toBe(3))
  it('gives no protocol to a leader without the keyword it names', () =>
    expect(combatRuleChoices(rule(battleProtocols, { scope: 'attached', keywords: ['Character', 'Cybernetica Datasmith'] }))).toEqual([]))
  it('offers the selected abilities that change an attack', () =>
    expect(combatRuleChoices(rule(noosphericTransference, { scope: 'detachment', keywords: kastelanRobots }))).toEqual([
      { label: 'Microactuator Bracing', effects: [{ role: 'defender', phases: ['ranged', 'melee'], toughness: 1 }] },
      { label: 'Muted Servomotors', effects: [{ role: 'defender', phases: ['ranged'], options: { cover: true }, ability: 'Stealth' }] },
    ]))
  it('reads protocols listed as dashes, as the catalogue prints them', () =>
    expect(
      combatRuleChoices(
        rule(
          'At the start of the battle, if this model is leading a ^^**Kastelan Robots^^** unit, that unit enters Aegis Protocols (see below). In your Command phase, if this model is leading a ^^**Kastelan Robots^^** unit, you can select one protocol from those listed below for that unit to enter. Once a unit enters a protocol, it remains in that protocol until it enters a different one.\n- Protector Protocol: Add 2 to the Attacks characteristic of ranged weapons equipped by ^^**Kastelan Robot^^** models in that unit.\n- Conqueror Protocol: Add 2 to the Attacks characteristic of melee weapons equipped by ^^**Kastelan Robot^^** models in that unit.\n- Aegis Protocol: Add 1 to the Toughness characteristic of ^^**Kastelan Robot^^** models in that unit.',
          { scope: 'attached', keywords: kastelanRobots, models: 2 },
        ),
      ).map((choice) => choice.label),
    ).toEqual(['Protector Protocol', 'Conqueror Protocol', 'Aegis Protocol']))
  it('reads selected abilities titled by their first line, as the catalogue prints them', () =>
    expect(
      combatRuleChoices(
        rule(noosphericTransference.replaceAll('**', '').replaceAll(/### (.+)\n\n/g, '$1\n'), {
          scope: 'detachment',
          keywords: kastelanRobots,
        }),
      ).map((choice) => choice.label),
    ).toEqual(['Microactuator Bracing', 'Muted Servomotors']))
  it('gives the selected ability only to the units the player selects, by the keyword they gain', () =>
    expect(
      shownRuleChoices(rule(noosphericTransference, { scope: 'detachment', keywords: kastelanRobots })).map((choice) => choice.selected),
    ).toEqual(['Halo Override', 'Halo Override', 'Halo Override']))
  it('leaves the selected abilities off until the player selects the unit', () =>
    expect(combatRuleDefault(rule(noosphericTransference, { scope: 'detachment', keywords: kastelanRobots }))).toBe(0))
})

describe('a condition a unit meets by its keyword or by standing near one that has it', () => {
  const conqueror =
    'Each time a model in this unit makes an attack, if this unit has the **BATTLELINE** keyword and/or it is within 6" of one or more friendly **ADEPTUS MECHANICUS BATTLELINE** units, improve the Armour Penetration characteristic of that attack by 1.'
  const ap = { role: 'attacker', phases: ['ranged', 'melee'], characteristic: { kind: 'armour-penetration', add: -1 } }

  it('always holds for a unit with the keyword', () =>
    expect(combatRuleChoices(rule(conqueror, { keywords: ['Battleline', 'Skitarii'], models: 10 }))).toEqual([
      { label: 'Active', effects: [ap] },
    ]))
  it('leaves a unit without the keyword the distance to choose, in its own words', () =>
    expect(combatRuleChoices(rule(conqueror, { keywords: ['Character', 'Tech-Priest'] }))).toEqual([
      { label: 'Within 6" of a friendly ADEPTUS MECHANICUS BATTLELINE unit', effects: [ap] },
    ]))
})
