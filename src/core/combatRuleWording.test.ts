import { describe, expect, it } from 'vitest'
import { compileCombatRule } from './combatRuleCompiler'
import { combatRuleAppliesTo, type CombatRule, type CombatRuleEffect } from './combatRules'

const compile = (description: string, extra: Partial<CombatRule> = {}) =>
  compileCombatRule({ id: 'rule', name: 'Rule', source: 'Source', scope: 'unit', models: 1, description, ...extra })
const effects = (description: string, extra: Partial<CombatRule> = {}) =>
  compile(description, extra)?.choices.map((choice) => choice.effects)
const attack = (fields: Partial<CombatRuleEffect>): CombatRuleEffect => ({ role: 'attacker', phases: ['ranged', 'melee'], ...fields })

describe('catalogue combat wording families', () => {
  it('keeps an army state defensive when its other benefits only permit movement and attacks', () => {
    const description =
      "Friendly ARMY with this ability can:\n- Re-roll advance rolls.\n- Become rallied, as stated in other rules.\nWhile a unit is rallied:\n- That unit has 5+ InSv.\n- That unit's ranged attacks have [ASSAULT].\n- When that unit is selected to make an advance move, that advance move does not prevent that unit from being eligible to declare a charge."
    expect(compile(description, { keywords: ['Army'] })).toEqual({
      defaultChoice: 0,
      choices: [{ label: 'This unit is rallied', effects: [{ role: 'defender', phases: ['ranged', 'melee'], invulnerable: 5 }] }],
    })
  })
  it('calculates a range-defined army state without treating its battle-shock dice as attack dice', () => {
    const description =
      'If your Army Faction is ARMY, while an ARMY unit from your army is within 6" of one or more friendly GUIDE models, that ARMY unit is said to be within Guidance Range of that model and of your army. While an ARMY unit from your army is within Guidance Range of your army:\n- Each time that unit takes a Battle-shock test, take that test on 3D6 instead of 2D6.\n- Each time a model in that unit makes a melee attack, add 1 to the Strength characteristic of that attack.'
    expect(compile(description, { keywords: ['Army'] })).toEqual({
      defaultChoice: 0,
      choices: [
        {
          label: 'This unit is within 6" of one or more friendly GUIDE models',
          effects: [attack({ phases: ['melee'], characteristic: { kind: 'strength', add: 1 } })],
        },
      ],
    })
  })
  it('refuses an unknown additional effect in an army-state definition', () => {
    expect(
      compile(
        'Friendly ARMY with this ability can:\n- Re-roll advance rolls.\n- Become rallied, as stated in other rules.\nWhile a unit is rallied:\n- That unit has 5+ InSv.\n- Inflict extra damage using an unknown mechanic.',
        { keywords: ['Army'] },
      ),
    ).toBeNull()
  })
  it.each([
    { keywords: ['Faction: Army', 'Vehicle'], eligible: true },
    { keywords: ['Vehicle'], eligible: false },
    { keywords: ['Faction: Army', 'Infantry'], eligible: false },
    { keywords: ['Faction: Army', 'Vehicle', 'Titanic'], eligible: false },
  ])('checks selected enemy restrictions against $keywords', ({ keywords, eligible }) => {
    expect(
      combatRuleAppliesTo(
        {
          id: 'selection',
          name: 'Selection',
          source: 'Source',
          scope: 'unit',
          models: 1,
          description:
            'At the start of your opponent\'s Shooting phase, select one enemy ARMY VEHICLE unit (excluding TITANIC units) within 12" of this model. Until the end of the phase, each time a model in that unit makes an attack, subtract 1 from the Hit roll.',
        },
        'defender',
        keywords,
      ),
    ).toBe(eligible)
  })
  it('does not swallow an unknown preceding sentence into an army recipient', () => {
    expect(
      compile(
        'Each time an ARMY unit from your army declares a charge, resolve an unknown attack effect. Each time an ARMY unit from your army makes an attack, add 1 to the Hit roll.',
      ),
    ).toBeNull()
  })
  it('retains an army attack bonus alongside charge-only instructions', () => {
    expect(
      effects(
        'Each time an ARMY unit from your army declares a charge, you can re-roll the Charge roll. If one or more targets of that charge are Below Half-strength, add 1 to the Charge roll as well. Each time an ARMY unit from your army makes a ranged attack that targets the closest eligible target, add 1 to the Armour Penetration characteristic of that attack.',
        { keywords: ['Army'] },
      ),
    ).toEqual([[attack({ phases: ['ranged'], characteristic: { kind: 'armour-penetration', add: -1 } })]])
  })
  it('treats positive weapon skill shorthand as an improvement', () => {
    expect(effects("This unit's melee attacks have +1 WS.")).toEqual([
      [attack({ phases: ['melee'], characteristic: { kind: 'weapon-skill', add: -1 } })],
    ])
  })
  it('combines shorthand characteristics and a weapon ability in an alternative', () => {
    expect(effects("Your unit's ranged attacks have:\n- +1 S.\n- Or: +1 S, AP and [Hazardous].")).toEqual([
      [attack({ phases: ['ranged'], characteristic: { kind: 'strength', add: 1 } })],
      [
        attack({ phases: ['ranged'], characteristic: { kind: 'strength', add: 1 } }),
        attack({ phases: ['ranged'], characteristic: { kind: 'armour-penetration', add: -1 } }),
      ],
    ])
  })
  it('does not ignore an unknown weapon ability in a stat alternative', () => {
    expect(compile("Your unit's ranged attacks have:\n- +1 S.\n- Or: +1 S, AP and [Unknown].")).toBeNull()
  })
  it('recognizes selected reinforcement recipients without a range requirement', () => {
    expect(
      compile(
        'Once per turn, select one ARMY unit that was set up on the battlefield using the Deep Strike ability this turn. Until the end of the turn, each time a model in that unit makes an attack, you can re-roll the Hit roll.',
        { keywords: ['Army'] },
      ),
    ).toEqual({
      defaultChoice: 0,
      choices: [{ label: 'Selected after using Deep Strike this turn', effects: [attack({ options: { hitReroll: 'failed' } })] }],
    })
  })
  it('rejects an unrelated selected reinforcement recipient', () => {
    expect(
      compile(
        'Once per turn, select one ARMY unit that was set up on the battlefield using the Deep Strike ability this turn. Until the end of the turn, each time a model in that unit makes an attack, you can re-roll the Hit roll.',
        { keywords: ['Other'] },
      ),
    ).toEqual({ choices: [], defaultChoice: 0 })
  })
  it('preserves an attack bonus alongside a noncombat characteristic change', () => {
    expect(
      effects(
        'Each time a model in this unit makes an attack, you can re-roll the Hit roll. Worsen the Leadership and Objective Control characteristics of this unit by 1.',
      ),
    ).toEqual([[attack({ options: { hitReroll: 'failed' } })]])
  })
  it('keeps resource spending as an optional upgrade to a passive effect', () => {
    expect(
      effects(
        "Each time a model in the bearer's unit makes an attack, re-roll a Hit roll of 1. Each time the bearer's unit is selected to shoot or fight, you can spend 3YP. If you do, until the end of the phase, weapons equipped by models in that unit have the [SUSTAINED HITS 1] ability.",
      ),
    ).toEqual([
      [attack({ options: { hitReroll: 'ones' } })],
      [attack({ options: { hitReroll: 'ones' } }), attack({ keyword: 'SUSTAINED HITS 1' })],
    ])
  })
  it('retains both tiers of a stratagem with an optional resource cost', () => {
    expect(
      effects(
        'Each time you use this Stratagem, you can spend 3YP. Until the end of the phase, ranged weapons equipped by models in your unit have the [SUSTAINED HITS 1] ability. If you spent YP during this use of this Stratagem, until the end of the phase, those weapons have the [SUSTAINED HITS 2] ability instead.',
        { scope: 'stratagem' },
      ),
    ).toEqual([
      [attack({ phases: ['ranged'], keyword: 'SUSTAINED HITS 1' })],
      [attack({ phases: ['ranged'], keyword: 'SUSTAINED HITS 2' })],
    ])
  })
  it('requires empowerment for a grant available in either combat phase', () => {
    expect(
      compile(
        'In your Shooting phase or the Fight phase, when you select this unit to shoot or fight, you can spend 1 Pain token to Empower this unit. While Empowered, weapons equipped by models in this unit have the [LETHAL HITS] ability.',
      ),
    ).toEqual({
      defaultChoice: 0,
      choices: [{ label: 'Empowered', effects: [attack({ keyword: 'LETHAL HITS' })] }],
    })
  })
  it('requires an explicit choice between two granted weapon abilities', () => {
    expect(
      compile(
        'Select either the [LETHAL HITS] or [SUSTAINED HITS 1] ability. Until the end of the phase, ranged weapons equipped by models in your unit have the selected ability.',
        { scope: 'stratagem' },
      ),
    ).toEqual({
      defaultChoice: 0,
      choices: [
        { label: 'LETHAL HITS', effects: [attack({ phases: ['ranged'], keyword: 'LETHAL HITS' })] },
        { label: 'SUSTAINED HITS 1', effects: [attack({ phases: ['ranged'], keyword: 'SUSTAINED HITS 1' })] },
      ],
    })
  })
  it('offers named-weapon ability bullets without granting them to other weapons', () => {
    expect(
      effects(
        "In your Shooting phase, each time this model is selected to shoot, select one of the abilities below. Until the end of the phase, this model's Rifle has that ability:\n- [IGNORES COVER]\n- [SUSTAINED HITS 3]",
      ),
    ).toEqual([
      [attack({ phases: ['ranged'], weapon: 'Rifle', keyword: 'IGNORES COVER' })],
      [attack({ phases: ['ranged'], weapon: 'Rifle', keyword: 'SUSTAINED HITS 3' })],
    ])
  })
  it('keeps named-weapon choice conditions explicit', () => {
    expect(
      compile(
        'If this unit made a Charge move this turn, select one of the abilities below. While resolving those attacks, melee weapons equipped by models in this unit have that ability:\n- [LETHAL HITS]\n- [SUSTAINED HITS 1]',
      )?.choices.map((choice) => choice.label),
    ).toEqual(['LETHAL HITS · Charged this turn', 'SUSTAINED HITS 1 · Charged this turn'])
  })
  it('does not calculate only known alternatives from a partly unknown ability menu', () => {
    expect(
      compile(
        'Select either the [LETHAL HITS] or [UNKNOWN ABILITY] ability. Until the end of the phase, weapons equipped by models in your unit have the selected ability.',
      ),
    ).toBeNull()
  })
  it('combines a bearer toughness improvement with feel no pain', () => {
    expect(effects("Add 1 to the bearer's Toughness characteristic and the bearer has the Feel No Pain 5+ ability.")).toEqual([
      [
        { role: 'defender', phases: ['ranged', 'melee'], toughness: 1 },
        { role: 'defender', phases: ['ranged', 'melee'], feelNoPain: 5 },
      ],
    ])
  })
  it('does not spread a bearer toughness improvement across its bodyguard', () => {
    expect(compile("Add 1 to the bearer's Toughness characteristic.", { models: 5, scope: 'attached' })).toEqual({
      choices: [],
      defaultChoice: 0,
    })
  })
  it('compiles a phase-long incoming damage replacement', () => {
    expect(
      effects(
        'Once per battle, at the start of any phase, this model can use this ability. If it does, until the end of the phase, each time an attack is allocated to this model, change the Damage characteristic of that attack to 1.',
      ),
    ).toEqual([[{ role: 'defender', phases: ['ranged', 'melee'], characteristic: { kind: 'damage', set: 1 } }]])
  })
  it('does not treat a one-attack damage cancellation as a phase-long replacement', () => {
    expect(
      compile('Once per battle, when an attack is allocated to this model, change the Damage characteristic of that attack to 0.'),
    ).toBeNull()
  })
  it('supports a declared enemy target without automatically enabling its bonus', () => {
    expect(
      compile(
        "At the start of the battle, select one unit from your opponent's army. Each time a model in this unit makes an attack that targets that unit, that attack has the [LETHAL HITS] ability.",
      ),
    ).toEqual({
      defaultChoice: 0,
      choices: [{ label: 'Against the selected target', effects: [attack({ keyword: 'LETHAL HITS' })] }],
    })
  })
  it('treats a ranged weapon category as a phase restriction rather than a weapon name', () => {
    expect(
      effects('Each time a model in this unit makes an attack with a ranged weapon, you can ignore any or all modifiers to the Hit roll.'),
    ).toEqual([[attack({ phases: ['ranged'], ignoreHitModifiers: true })]])
  })
  it('retains the attack bonus beside a leadership profile under the same proximity condition', () => {
    expect(
      compile(
        'While this unit is within 12" of one or more friendly ARMY PSYKER models, models in this unit have a Leadership characteristic of 6+ and each time a model in this unit makes an attack, add 1 to the Hit roll.',
      ),
    ).toEqual({
      defaultChoice: 0,
      choices: [
        { label: 'This unit is within 12" of one or more friendly ARMY PSYKER models', effects: [attack({ options: { hitModifier: 1 } })] },
      ],
    })
  })
  it('applies a selected enemy attack penalty only while defending in that phase', () => {
    expect(
      effects(
        'At the start of the Fight phase, select one enemy unit within Engagement Range of this model. Until the end of the phase, each time a model in that enemy unit makes an attack, subtract 1 from the Hit roll.',
      ),
    ).toEqual([[{ role: 'defender', phases: ['melee'], options: { hitModifier: -1 } }]])
  })
  it('distinguishes friendly attacks against a selected enemy from attacks made by that enemy', () => {
    expect(
      effects(
        'At the start of the Fight phase, select one enemy unit within Engagement Range of this model. Until the end of the phase, each time a friendly ARMY model makes an attack that targets that unit, you can re-roll a Wound roll of 1.',
        { keywords: ['Army'] },
      ),
    ).toEqual([[attack({ phases: ['melee'], options: { woundReroll: 'ones' } })]])
  })
  it('does not offer a selected-target bonus to an unrelated friendly unit', () => {
    expect(
      compile(
        'At the start of the Fight phase, select one enemy unit within Engagement Range of this model. Until the end of the phase, each time a friendly ARMY model makes an attack that targets that unit, you can re-roll a Wound roll of 1.',
        { keywords: ['Other'] },
      ),
    ).toEqual({ choices: [], defaultChoice: 0 })
  })
  it('treats a post-shooting mark that penalizes enemy attacks as a defensive effect', () => {
    expect(
      effects(
        'In your Shooting phase, after this model has shot, select one enemy unit that was hit by one or more of those attacks. Until the start of your next Shooting phase, each time a model in that unit makes an attack, subtract 1 from the Hit roll.',
      ),
    ).toEqual([[{ role: 'defender', phases: ['ranged', 'melee'], options: { hitModifier: -1 } }]])
  })
  it('keeps a reinforcement grant off and checks the friendly recipient', () => {
    expect(
      compile(
        'Each time an ARMY unit from your army is set up on the battlefield as Reinforcements, until the end of your next Fight phase, weapons equipped by models in that unit have the [LETHAL HITS] ability.',
        { keywords: ['Army'] },
      ),
    ).toEqual({
      defaultChoice: 0,
      choices: [{ label: 'Set up as Reinforcements', effects: [attack({ keyword: 'LETHAL HITS' })] }],
    })
  })
  it('excludes an unrelated reinforcement recipient', () => {
    expect(
      compile(
        'Each time an ARMY unit from your army is set up on the battlefield as Reinforcements, until the end of your next Fight phase, weapons equipped by models in that unit have the [LETHAL HITS] ability.',
        { keywords: ['Other'] },
      ),
    ).toEqual({ choices: [], defaultChoice: 0 })
  })
  it('keeps a permanent conditional defensive upgrade separate from its starting value', () => {
    expect(
      effects(
        'The bearer has the Feel No Pain 5+ ability. At the start of any turn, if the bearer has fewer than its starting number of wounds remaining, until the end of the battle, it has the Feel No Pain 4+ ability instead.',
      ),
    ).toEqual([
      [{ role: 'defender', phases: ['ranged', 'melee'], feelNoPain: 5 }],
      [{ role: 'defender', phases: ['ranged', 'melee'], feelNoPain: 4 }],
    ])
  })
  it('combines stat and keyword bullets under their attack subject', () => {
    expect(effects("This unit's melee attacks have:\n- +1 AP.\n- [CLEAVE 1].")).toEqual([
      [
        attack({ phases: ['melee'], characteristic: { kind: 'armour-penetration', add: -1 } }),
        attack({ phases: ['melee'], keyword: 'CLEAVE 1' }),
      ],
    ])
  })
  it('keeps a conditional bullet separate from the unconditional grant', () => {
    expect(
      effects("This unit's ranged attacks have:\n- [LETHAL HITS].\n- If this unit has the Flame Discipline ability, [SUSTAINED HITS 1]."),
    ).toEqual([
      [attack({ phases: ['ranged'], keyword: 'LETHAL HITS' })],
      [attack({ phases: ['ranged'], keyword: 'LETHAL HITS' }), attack({ phases: ['ranged'], keyword: 'SUSTAINED HITS 1' })],
    ])
  })
  it('keeps bullet alternatives exclusive and off until selected', () => {
    expect(
      compile("When this unit is selected to fight, this model's melee attacks have:\n- [LETHAL HITS].\n- Or: [SUSTAINED HITS 1]."),
    ).toEqual({
      defaultChoice: 0,
      choices: [
        { label: 'LETHAL HITS', effects: [attack({ phases: ['melee'], keyword: 'LETHAL HITS' })] },
        { label: 'SUSTAINED HITS 1', effects: [attack({ phases: ['melee'], keyword: 'SUSTAINED HITS 1' })] },
      ],
    })
  })
  it('does not spread model-only attack bullets across a squad', () => {
    expect(compile("This model's melee attacks have:\n- +2 A.\n- [LETHAL HITS].", { models: 5 })).toBeNull()
  })
  it('refuses an unknown bullet alongside a calculated bonus', () => {
    expect(compile("This unit's melee attacks have:\n- +1 AP.\n- Additional damage by an unknown mechanic.")).toBeNull()
  })
  it.each([
    'the Weapon Skill, Ballistic Skill and/or Hit roll',
    "that attack's Ballistic Skill or Weapon Skill characteristics and/or all modifiers to the Hit roll",
    "that attack's Ballistic Skill characteristic and/or any or all modifiers to that attack's Hit roll",
  ])('recognizes all named supported modifier targets: %s', (targets) => {
    expect(effects(`Each time a model in this unit makes an attack, you can ignore any or all modifiers to ${targets}.`)).toEqual([
      [attack({ ignoreSkillModifiers: true, ignoreHitModifiers: true })],
    ])
  })
  it('does not drop an unsupported modifier target from an ignore list', () => {
    expect(
      compile(
        'Each time a model in this unit makes an attack, you can ignore any or all modifiers to the Hit roll and the Armour Penetration characteristic.',
      ),
    ).toBeNull()
  })
  it('keeps different ranged and melee invulnerable saves separate', () => {
    expect(
      effects('The bearer has a 4+ invulnerable save against ranged attacks, and a 5+ invulnerable save against melee attacks.'),
    ).toEqual([
      [
        { role: 'defender', phases: ['ranged'], invulnerable: 4 },
        { role: 'defender', phases: ['melee'], invulnerable: 5 },
      ],
    ])
  })
  it('retains stealth alongside deployment and targeting abilities', () => {
    expect(effects("Models in this model's unit have the Infiltrators, Lone Operative and Stealth abilities.")).toEqual([
      [{ role: 'defender', phases: ['ranged'], options: { cover: true } }],
    ])
  })
  it('requires activation for an ability available at the start of any phase', () => {
    expect(
      compile(
        'Once per battle, at the start of any phase, the bearer can use this Enhancement. If it does, until the end of the phase, the bearer has a 2+ invulnerable save.',
      ),
    ).toEqual({
      defaultChoice: 0,
      choices: [{ label: 'Ability activated', effects: [{ role: 'defender', phases: ['ranged', 'melee'], invulnerable: 2 }] }],
    })
  })
  it('recognizes an activation after selecting the unit to shoot', () => {
    expect(
      compile(
        "In your Shooting phase, when this unit is selected to shoot, you can use this ability. If you do, this unit's ranged attacks have +1 to hit rolls. Place any number of Familiar tokens next to the unit, removing them when this ability is used.",
      ),
    ).toEqual({
      defaultChoice: 0,
      choices: [{ label: 'Ability activated', effects: [attack({ phases: ['ranged'], options: { hitModifier: 1 } })] }],
    })
  })
  it('retains a reroll followed by a resource award after destroying a model', () => {
    expect(
      effects(
        "Each time this model makes an attack, you can re-roll the Hit roll. Each time this model's unit destroys a CHARACTER model, you gain 1CP.",
      ),
    ).toEqual([[attack({ options: { hitReroll: 'failed' } })]])
  })
  it('retains feel no pain alongside command-phase healing', () => {
    expect(
      effects('This model has the Feel No Pain 5+ ability and, at the start of your Command phase, this model regains 1 lost wound.'),
    ).toEqual([[{ role: 'defender', phases: ['ranged', 'melee'], feelNoPain: 5 }]])
  })
  it('recognizes defensive AP wording without the word characteristic', () => {
    expect(
      effects('Each time an attack targets this unit, worsen the Armour Penetration of that attack by 1 (to a minimum of 0).'),
    ).toEqual([[{ role: 'defender', phases: ['ranged', 'melee'], characteristic: { kind: 'armour-penetration', add: 1 } }]])
  })
})
