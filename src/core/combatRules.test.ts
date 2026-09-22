import { describe, expect, it } from 'vitest'
import type { Datasheet } from '../contracts/catalogue'
import { combatWeapons } from './combatProfiles'
import {
  combatRuleChoices,
  combatRuleAppliesTo,
  combatRuleRecipient,
  combatRuleDefault,
  combatRuleDefences,
  combatRuleEligible,
  combatRuleOptions,
  combatRuleProfiles,
  combatRuleWeapons,
  type CombatRule,
} from './combatRules'

const rule = (description: string, extra: Partial<CombatRule> = {}): CombatRule => ({
  id: 'buff',
  name: 'Buff',
  source: 'Source',
  scope: 'unit',
  description,
  models: 1,
  ...extra,
})
const weapons = (): Datasheet => ({
  id: 'unit',
  slug: 'unit',
  referenceRoute: null,
  name: 'Unit',
  points: null,
  keywords: ['Infantry'],
  profiles: [
    {
      id: 'gun',
      name: 'Rifle',
      type: 'Ranged Weapons',
      count: 1,
      values: Object.entries({ A: 'D6', BS: '3+', S: '4', AP: '-1', D: '2', Keywords: '' }).map(([name, value]) => ({ name, value })),
    },
    {
      id: 'blade',
      name: 'Blade',
      type: 'Melee Weapons',
      count: 1,
      values: Object.entries({ A: '3', WS: '3+', S: '4', AP: '-1', D: '2', Keywords: '' }).map(([name, value]) => ({ name, value })),
    },
  ],
  abilities: [],
  composition: [],
  loadout: null,
  wargearOptions: [],
  baseSize: null,
  transport: null,
  costs: [],
  attachments: [],
  leaders: [],
  supporters: [],
  keywordRules: [],
})

describe('combat rule eligibility', () => {
  const target = '**Target:** One **ARMY** unit (excluding **MONSTERS** and **VEHICLES**) from your army.\n\n**Effect:** Attack.'
  it('does not treat one or more attacks as an unrestricted target alternative', () =>
    expect(
      combatRuleEligible('**Target:** One **CULT** unit from your army that was selected as the target of one or more attacks.', [
        'Army',
        'Infantry',
      ]),
    ).toBe(false))
  it('enforces unbold uppercase keyword requirements', () =>
    expect(combatRuleEligible('**Target:** One CULT unit from your army.', ['Army', 'Infantry'])).toBe(false))
  it('enforces unbold uppercase exclusions', () =>
    expect(combatRuleEligible('**Target:** One ARMY unit (excluding MONSTERS and VEHICLES).', ['Army', 'Vehicle'])).toBe(false))
  it('keeps a matching faction infantry unit', () => expect(combatRuleEligible(target, ['Faction: Army', 'Infantry'])).toBe(true))
  it.each(['Monster', 'Vehicle'])('excludes a %s by its printed plural restriction', (keyword) =>
    expect(combatRuleEligible(target, ['Army', keyword])).toBe(false),
  )
  it('excludes a different faction', () => expect(combatRuleEligible(target, ['Other', 'Infantry'])).toBe(false))
  it('accepts either compound keyword target', () =>
    expect(combatRuleEligible('**Target:** One **ARMY INFANTRY** or **ARMY MOUNTED** unit.', ['Army', 'Mounted'])).toBe(true))
  it('requires every keyword in a compound target', () =>
    expect(combatRuleEligible('**Target:** One **ARMY INFANTRY** unit.', ['Army', 'Vehicle'])).toBe(false))
})

describe('combat rule effects', () => {
  it('does not mistake the opposing aura for an already applied friendly aura with the same name', () => {
    const buff = rule(
      'While a friendly ARMY unit is within 3" of this model, each time a model in that unit makes an attack, improve the Armour Penetration characteristic of that attack by 1, and each time an attack targets that unit, worsen the Armour Penetration characteristic of that attack by 1.',
    )
    const active = { name: 'Buff', effects: combatRuleChoices(buff)[0]!.effects }
    const sheet = weapons()
    const original = sheet.profiles[0]!.values.find((value) => value.name === 'AP')!
    Object.assign(original, { value: '-2', baseValue: '-1', modifiers: ['Buff'] })
    expect(combatWeapons(combatRuleProfiles(sheet, [active], 'attacker', [], [active]), [], 'ranged')[0]?.weapon?.ap).toBe(-1)
  })
  it('sums opposing modifiers before clamping the final skill', () => {
    const attack = {
      name: 'Boost',
      effects: combatRuleChoices(
        rule('Improve the Ballistic Skill characteristic of ranged weapons equipped by models in this unit by 3.'),
      )[0]!.effects,
    }
    const defence = {
      name: 'Penalty',
      effects: combatRuleChoices(
        rule('Each time a ranged attack targets this unit, worsen the Ballistic Skill characteristic of that attack by 1.'),
      )[0]!.effects,
    }
    expect(combatWeapons(combatRuleProfiles(weapons(), [attack], 'attacker', [], [defence]), [], 'ranged')[0]?.weapon?.skill).toBe(2)
  })
  it('uses the stronger AP improvement when an effect cannot stack', () => {
    const effects = combatRuleChoices(
      rule(
        'Improve the Armour Penetration characteristic of melee weapons equipped by models in this unit by 1 (this is not cumulative with any other modifiers that improve Armour Penetration).',
      ),
    )[0]!.effects
    const other = combatRuleChoices(
      rule('Improve the Armour Penetration characteristic of melee weapons equipped by models in this unit by 2.'),
    )[0]!.effects
    expect(
      combatWeapons(
        combatRuleProfiles(
          weapons(),
          [
            { name: 'Exclusive', effects },
            { name: 'Normal', effects: other },
          ],
          'attacker',
        ),
        [],
        'melee',
      )[0]?.weapon?.ap,
    ).toBe(-3)
  })
  it('does not stack an exclusive AP bonus with an already projected improvement', () => {
    const sheet = weapons()
    Object.assign(
      sheet.profiles[1]!.values.find((value) => value.name === 'AP')!,
      { value: '-2', baseValue: '-1', modifiers: ['Other'] },
    )
    const effects = combatRuleChoices(
      rule(
        'Improve the Armour Penetration characteristic of melee weapons equipped by models in this unit by 1 (this is not cumulative with any other modifiers that improve Armour Penetration).',
      ),
    )[0]!.effects
    expect(combatWeapons(combatRuleProfiles(sheet, [{ name: 'Exclusive', effects }], 'attacker'), [], 'melee')[0]?.weapon?.ap).toBe(-2)
  })
  it('keeps target-specific and weapon-specific wound bonuses off other attacks', () => {
    const sheet = weapons()
    const effects = combatRuleChoices(
      rule('Each time this model makes a ranged attack with its Rifle that targets a VEHICLE unit, add 1 to the Wound roll.'),
    )[0]!.effects
    const used = combatWeapons(sheet, [], 'ranged').map((profile) => ({ ...profile, count: 1 }))
    expect(combatRuleWeapons(used, [{ name: 'Buff', effects }], 'attacker', 'ranged', ['Infantry'])[0]?.woundModifier).toBeUndefined()
  })
  it('applies a target-specific wound bonus to the matching named weapon', () => {
    const effects = combatRuleChoices(
      rule('Each time this model makes a ranged attack with its Rifle that targets a VEHICLE unit, add 1 to the Wound roll.'),
    )[0]!.effects
    const used = combatWeapons(weapons(), [], 'ranged').map((profile) => ({ ...profile, count: 1 }))
    expect(combatRuleWeapons(used, [{ name: 'Buff', effects }], 'attacker', 'ranged', ['Vehicle'])[0]?.woundModifier).toBe(1)
  })
  const leadership = 'While this model is leading a unit, weapons equipped by models in that unit have the [LETHAL HITS] ability.'
  it('starts a supported attached leader effect active', () => expect(combatRuleDefault(rule(leadership, { scope: 'attached' }))).toBe(1))
  it('does not assume an unattached leader is leading', () => expect(combatRuleDefault(rule(leadership, { scope: 'unit' }))).toBe(0))
  it('does not assume a nearby unit is in range', () => expect(combatRuleDefault(rule(leadership, { scope: 'nearby' }))).toBe(0))
  it('starts single-model passive damage reduction active', () =>
    expect(
      combatRuleDefault(
        rule('Each time an attack is allocated to this model, subtract 1 from the Damage characteristic of that attack.', {
          scope: 'unit',
          models: 1,
        }),
      ),
    ).toBe(1))
  it('cannot activate unsupported extra clauses by default', () =>
    expect(combatRuleDefault(rule(`${leadership} Add D3 mortal wounds as well.`, { scope: 'attached' }))).toBe(0))
  const grant = 'Until the end of the phase, ranged weapons equipped by models in your unit have the **[IGNORES COVER]** ability.'
  it('separates a conditional bonus from the base effect', () => {
    const choices = combatRuleChoices(
      rule(
        `${grant} If your unit is under the effects of the Siege Doctrine, until the end of the phase, improve the Armour Penetration characteristic of such weapons by 1 as well.`,
      ),
    )
    expect(choices.map((choice) => choice.effects)).toEqual([
      [{ role: 'attacker', phases: ['ranged'], keyword: 'IGNORES COVER' }],
      [
        { role: 'attacker', phases: ['ranged'], keyword: 'IGNORES COVER' },
        { role: 'attacker', phases: ['ranged'], characteristic: { kind: 'armour-penetration', add: -1 } },
      ],
    ])
  })
  it('refuses a partly understood compound effect', () =>
    expect(combatRuleChoices(rule(`${grant} In addition, each critical hit inflicts D3 mortal wounds.`))).toEqual([]))
  it('does not reapply an effect already in the evaluated profile', () =>
    expect(combatRuleChoices(rule(grant, { included: true }))).toEqual([]))
  it('keeps bearer-only defences off a multi-model unit', () =>
    expect(
      combatRuleChoices(
        rule('Each time an attack is allocated to this model, subtract 1 from the Damage characteristic of that attack.', { models: 5 }),
      ),
    ).toEqual([]))
  it('retains the phase of a defensive hit modifier', () =>
    expect(
      combatRuleChoices(
        rule('Until the end of the phase, each time an attack targets your unit, subtract 1 from the Hit roll.', { phases: ['melee'] }),
      )[0]?.effects,
    ).toEqual([{ role: 'defender', phases: ['melee'], options: { hitModifier: -1 } }]))
  it('recognizes a nearby unit reroll while preserving its explicit scope', () =>
    expect(
      combatRuleChoices(
        rule(
          'While a friendly ARMY unit is within 6" of this model, each time a model in that unit makes a ranged attack, you can re-roll a Hit roll of 1.',
          { scope: 'nearby' },
        ),
      )[0]?.effects,
    ).toEqual([{ role: 'attacker', phases: ['ranged'], options: { hitReroll: 'ones' } }]))
  it('feeds granted keywords through the existing weapon parser', () => {
    const effects = combatRuleChoices(rule(grant))[0]!.effects
    expect(
      combatWeapons(combatRuleProfiles(weapons(), [{ name: 'Buff', effects }], 'attacker'), [], 'ranged')[0]?.weapon?.ignoresCover,
    ).toBe(true)
  })
  it('does not apply a shooting grant in melee', () => {
    const effects = combatRuleChoices(rule(grant))[0]!.effects
    expect(
      combatWeapons(combatRuleProfiles(weapons(), [{ name: 'Buff', effects }], 'attacker'), [], 'melee')[0]?.weapon?.ignoresCover,
    ).toBe(false)
  })
  it('does not duplicate a keyword the weapon already has', () => {
    const buffs = [{ name: 'Buff', effects: combatRuleChoices(rule(grant))[0]!.effects }]
    const once = combatRuleProfiles(weapons(), buffs, 'attacker')
    expect(combatWeapons(combatRuleProfiles(once, buffs, 'attacker'), [], 'ranged')[0]?.error).toBeNull()
  })
  it('modifies dice attacks without replacing them with a fixed count', () => {
    const modified = combatRuleProfiles(
      weapons(),
      [{ name: 'Extra attacks', effects: [{ role: 'attacker', phases: ['ranged'], characteristic: { kind: 'attacks', add: 2 } }] }],
      'attacker',
    )
    expect(combatWeapons(modified, [], 'ranged')[0]?.weapon?.attacks).toEqual({ dice: 1, sides: 6, bonus: 2 })
  })
  it('does not apply another named weapon’s bonus', () => {
    const modified = combatRuleProfiles(
      weapons(),
      [
        {
          name: 'Extra attacks',
          effects: [{ role: 'attacker', phases: ['ranged'], weapon: 'Other gun', characteristic: { kind: 'attacks', add: 2 } }],
        },
      ],
      'attacker',
    )
    expect(combatWeapons(modified, [], 'ranged')[0]?.weapon?.attacks.bonus).toBe(0)
  })
  it('applies defensive armour penetration only to the opponent’s attacks', () => {
    const effects = combatRuleChoices(
      rule(
        'Until the attacking unit has finished making its attacks, each time an attack targets your unit, worsen the Armour Penetration characteristic of that attack by 1.',
      ),
    )[0]!.effects
    expect(combatWeapons(combatRuleProfiles(weapons(), [{ name: 'Armour', effects }], 'defender'), [], 'ranged')[0]?.weapon?.ap).toBe(0)
  })
  it('combines independent modifiers before the combat engine caps them', () =>
    expect(
      combatRuleOptions(
        [
          { name: 'First', effects: [{ role: 'attacker', phases: ['ranged'], options: { hitModifier: 1 } }] },
          { name: 'Second', effects: [{ role: 'attacker', phases: ['ranged'], options: { hitModifier: 1 } }] },
        ],
        'attacker',
        'ranged',
      ).hitModifier,
    ).toBe(2))
  it('stacks damage reduction from distinct rules', () => {
    const effects = [{ role: 'defender' as const, phases: ['ranged' as const], damageReduction: 1 }]
    expect(
      combatRuleDefences(
        { models: 1, toughness: 4, save: 3, wounds: 5, invulnerable: null, feelNoPain: null },
        [
          { name: 'First', effects },
          { name: 'Second', effects },
        ],
        'ranged',
      ).damageReduction,
    ).toBe(2)
  })
  it('preserves beneficial modifiers separately for Psychic attacks', () => {
    expect(
      combatRuleOptions(
        [
          { name: 'Bonus', effects: [{ role: 'attacker', phases: ['ranged'], options: { hitModifier: 1 } }] },
          { name: 'Penalty', effects: [{ role: 'attacker', phases: ['ranged'], options: { hitModifier: -1 } }] },
        ],
        'attacker',
        'ranged',
      ),
    ).toMatchObject({ hitModifier: 0, psychicHitModifier: 1 })
  })
  it('keeps the best damage prevention instead of stacking copies', () =>
    expect(
      combatRuleDefences(
        { models: 1, toughness: 4, save: 3, wounds: 5, invulnerable: null, feelNoPain: 4 },
        [
          {
            name: 'Guard',
            effects: [
              { role: 'defender', phases: ['ranged'], feelNoPain: 5, damageReduction: 1 },
              { role: 'defender', phases: ['ranged'], damageReduction: 1 },
            ],
          },
        ],
        'ranged',
      ),
    ).toMatchObject({ feelNoPain: 4, damageReduction: 1 }))
})

describe('conditional support auras', () => {
  const description =
    'While a friendly ^^**ARMY^^** unit (excluding ^^**MONSTER**^^ and ^^**TITANIC^^** units) is within 6” of this model, each time a model in that unit makes an attack, if that model has the ^^**CULT^^** keyword or that enemy unit is the closest eligible target, that attack has the [SUSTAINED HITS 1] ability.'
  const aura = (keywords: string[]) => rule(description, { scope: 'nearby', keywords })
  it('keeps the closest-target requirement for other eligible units', () =>
    expect(combatRuleChoices(aura(['Army', 'Infantry']))[0]?.label).toBe('Within 6" · Closest eligible target'))
  it('needs only range confirmation when the recipient has the required keyword', () =>
    expect(combatRuleChoices(aura(['Army', 'Cult']))[0]?.label).toBe('Within 6"'))
  it.each(['Monster', 'Titanic'])('excludes %s even when its faction matches', (keyword) =>
    expect(combatRuleEligible(description, ['Army', keyword])).toBe(false),
  )
  it('excludes a unit from another army', () => expect(combatRuleEligible(description, ['Other', 'Cult'])).toBe(false))
  it('applies the aura to both attacking phases', () =>
    expect(combatRuleChoices(aura(['Army', 'Cult']))[0]?.effects).toEqual([
      { role: 'attacker', phases: ['ranged', 'melee'], keyword: 'SUSTAINED HITS 1' },
    ]))
  it('does not offer the offensive aura to a defender', () => expect(combatRuleAppliesTo(aura(['Army']), 'defender')).toBe(false))
  it('rejects an extra unknown effect', () =>
    expect(combatRuleChoices({ ...aura(['Army']), description: description + ' Inflict D3 mortal wounds as well.' })).toEqual([]))
  it('does not treat proximity that protects the source as a support aura', () =>
    expect(
      combatRuleRecipient(
        'While this model is within 3" of one or more other friendly CULT units, this model has the Lone Operative ability.',
      ),
    ).toBeUndefined())
  it('keeps the stronger existing Sustained Hits value', () => {
    const strong = [{ name: 'Strong', effects: [{ role: 'attacker' as const, phases: ['ranged' as const], keyword: 'Sustained Hits 2' }] }]
    const sheet = combatRuleProfiles(weapons(), strong, 'attacker')
    const buffed = combatRuleProfiles(sheet, [{ name: 'Aura', effects: combatRuleChoices(aura(['Army']))[0]!.effects }], 'attacker')
    expect(combatWeapons(buffed, [], 'ranged')[0]?.weapon?.sustained).toBe(2)
  })
  it('replaces a weaker Sustained Hits value without stacking', () => {
    const sheet = combatRuleProfiles(weapons(), [{ name: 'Aura', effects: combatRuleChoices(aura(['Army']))[0]!.effects }], 'attacker')
    const buffed = combatRuleProfiles(
      sheet,
      [{ name: 'Strong', effects: [{ role: 'attacker', phases: ['ranged'], keyword: 'Sustained Hits 2' }] }],
      'attacker',
    )
    expect(combatWeapons(buffed, [], 'ranged')[0]?.weapon?.sustained).toBe(2)
  })
})

describe('combat roles', () => {
  it.each([
    ['While this model is leading a unit, weapons equipped by models in that unit have the [LETHAL HITS] ability.', 'defender'],
    ['Each time an attack targets this unit, subtract 1 from the Hit roll, unless that unit is within 6".', 'attacker'],
    ['Models in this unit have the Feel No Pain 5+ ability against mortal wounds and Psychic Attacks.', 'attacker'],
    ['At the end of your Command phase, this unit heals D3 wounds.', 'attacker'],
    ['At the end of your Command phase, this unit heals D3 wounds.', 'defender'],
  ] as const)('hides %s from the %s', (description, role) => expect(combatRuleAppliesTo(rule(description), role)).toBe(false))
  it('retains an unsupported defensive rule on the defender', () =>
    expect(
      combatRuleAppliesTo(
        rule('Each time an attack targets this unit, subtract 1 from the Hit roll, unless that unit is within 6".'),
        'defender',
      ),
    ).toBe(true))
  it('filters already projected offensive stats by role too', () =>
    expect(
      combatRuleAppliesTo(rule('Melee weapons equipped by this model have the [LETHAL HITS] ability.', { included: true }), 'defender'),
    ).toBe(false))
})

describe('conditional defence and triggered support', () => {
  it('limits conditional damage prevention to Psychic attacks and mortal wounds', () =>
    expect(
      combatRuleChoices(
        rule(
          'While a friendly ARMY unit is within 6" of the bearer, models in that unit have the Feel No Pain 5+ ability against mortal wounds and Psychic Attacks.',
          { scope: 'nearby' },
        ),
      )[0]?.effects,
    ).toEqual([{ role: 'defender', phases: ['ranged', 'melee'], psychicFeelNoPain: 5, mortalFeelNoPain: 5 }]))
  it('keeps the destruction trigger and range explicit', () =>
    expect(
      combatRuleChoices(
        rule(
          'Each time this model destroys an enemy unit, select one other friendly CULT unit within 9" of it. Until the end of the phase, each time a model in that unit makes an attack, re‑roll a Wound roll of 1.',
          { scope: 'nearby' },
        ),
      )[0],
    ).toEqual({
      label: 'After Source destroys a unit · Within 9"',
      effects: [{ role: 'attacker', phases: ['ranged', 'melee'], options: { woundReroll: 'ones' } }],
    }))
  it('recognizes the alternate damage-reduction phrasing', () =>
    expect(
      combatRuleChoices(rule('Each time an attack is allocated to this model, subtract 1 from that attack’s Damage characteristic.'))[0]
        ?.effects,
    ).toEqual([{ role: 'defender', phases: ['ranged', 'melee'], damageReduction: 1 }]))
})

it('keeps a passive reroll and its objective-dependent upgrade separate', () => {
  const passive = rule(
    'Each time a model in this unit makes an attack, re-roll a Wound roll of 1. If the target of that attack is an enemy unit within range of an objective marker, you can re-roll the Wound roll instead.',
  )
  expect([combatRuleDefault(passive), combatRuleChoices(passive).map((choice) => choice.effects[0]?.options?.woundReroll)]).toEqual([
    1,
    ['ones', 'failed'],
  ])
})
