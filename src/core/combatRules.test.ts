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
  it('applies an incoming damage replacement to the attacking weapons', () => {
    const defensive = {
      name: 'Protection',
      effects: combatRuleChoices(
        rule('Each time an attack is allocated to this model, change the Damage characteristic of that attack to 1.'),
      )[0]!.effects,
    }
    const sheet = combatRuleProfiles(weapons(), [], 'attacker', [], [defensive])
    expect(combatWeapons(sheet, [], 'ranged')[0]?.weapon?.damage).toEqual({ dice: 0, sides: 6, bonus: 1 })
  })
  it('does not apply a defensive damage replacement when its source is attacking', () => {
    const defensive = {
      name: 'Protection',
      effects: combatRuleChoices(
        rule('Each time an attack is allocated to this model, change the Damage characteristic of that attack to 1.'),
      )[0]!.effects,
    }
    expect(combatWeapons(combatRuleProfiles(weapons(), [defensive], 'attacker'), [], 'ranged')[0]?.weapon?.damage).toEqual({
      dice: 0,
      sides: 6,
      bonus: 2,
    })
  })
  it('retains feel no pain when the toughness bonus is already projected', () => {
    expect(
      combatRuleChoices(
        rule("Add 1 to the bearer's Toughness characteristic and the bearer has the Feel No Pain 5+ ability.", {
          appliedDefences: ['toughness'],
        }),
      )[0]?.effects,
    ).toEqual([{ role: 'defender', phases: ['ranged', 'melee'], feelNoPain: 5 }])
  })
  it('keeps random Sustained Hits when a weaker fixed grant is added', () => {
    const sheet = weapons()
    sheet.profiles[0]!.values.find((value) => value.name === 'Keywords')!.value = 'Sustained Hits D3'
    const active = [
      {
        name: 'Buff',
        effects: combatRuleChoices(rule('Ranged weapons equipped by models in this unit have the [SUSTAINED HITS 1] ability.'))[0]!.effects,
      },
    ]
    expect(combatWeapons(combatRuleProfiles(sheet, active, 'attacker'), [], 'ranged')[0]?.weapon?.sustained).toEqual({
      dice: 1,
      sides: 3,
      bonus: 0,
    })
  })
  it.each(['ranged', 'melee'] as const)(
    'applies enemy Toughness and armour penalties without changing invulnerable saves in %s',
    (phase) => {
      const target = { models: 5, toughness: 4, save: 3, invulnerable: 4, wounds: 2, feelNoPain: null }
      const aura = {
        name: 'Infection',
        effects: [
          { role: 'attacker' as const, phases: ['ranged', 'melee'] as const, targetToughness: -1 },
          { role: 'attacker' as const, phases: ['ranged', 'melee'] as const, targetSaveModifier: 1 },
        ].map((effect) => ({ ...effect, phases: [...effect.phases] })),
      }
      expect(combatRuleDefences(target, [], phase, [aura, aura])).toMatchObject({ toughness: 3, save: 4, invulnerable: 4 })
    },
  )
  it('does not apply a defending aura to its own Toughness or armour', () => {
    const target = { models: 5, toughness: 4, save: 3, invulnerable: null, wounds: 2, feelNoPain: null }
    expect(
      combatRuleDefences(
        target,
        [{ name: 'Infection', effects: [{ role: 'attacker', phases: ['ranged', 'melee'], targetToughness: -1, targetSaveModifier: 1 }] }],
        'ranged',
      ),
    ).toMatchObject({ toughness: 4, save: 3 })
  })
  it('combines opposing Toughness changes before applying characteristic limits', () => {
    const target = { models: 1, toughness: 1, save: 7, invulnerable: null, wounds: 1, feelNoPain: null }
    expect(
      combatRuleDefences(target, [{ name: 'Defence', effects: [{ role: 'defender', phases: ['melee'], toughness: 1 }] }], 'melee', [
        { name: 'Infection', effects: [{ role: 'attacker', phases: ['melee'], targetToughness: -1, targetSaveModifier: 1 }] },
      ]),
    ).toMatchObject({ toughness: 1, save: 7 })
  })
  it('keeps enemy characteristic penalties within their phase', () => {
    const target = { models: 1, toughness: 4, save: 3, invulnerable: null, wounds: 1, feelNoPain: null }
    expect(
      combatRuleDefences(target, [], 'ranged', [
        { name: 'Infection', effects: [{ role: 'attacker', phases: ['melee'], targetToughness: -1, targetSaveModifier: 1 }] },
      ]),
    ).toMatchObject({ toughness: 4, save: 3 })
  })
  it('carries a not-stronger wound condition only onto melee weapons', () => {
    const sheet = weapons()
    const active = [
      {
        name: 'Challenge',
        effects: combatRuleChoices(
          rule(
            'Each time a model in this unit makes a melee attack, if the Strength characteristic of that attack is less than or equal to the Toughness characteristic of the target, add 1 to the Wound roll.',
          ),
        )[0]!.effects,
      },
    ]
    expect(
      (['ranged', 'melee'] as const).map(
        (phase) =>
          combatRuleWeapons(
            sheet,
            combatWeapons(sheet, [], phase).map((entry) => ({ ...entry, count: 1 })),
            active,
            'attacker',
            phase,
            [],
          )[0]?.notStrongerWoundModifier,
      ),
    ).toEqual([undefined, 1])
  })
  const weaponReplacement =
    'Once per battle, when this model is selected to shoot, it can use this ability. If it does, until the end of the phase, its Rifle weapon has a Damage characteristic of 3 and the [ANTI-INFANTRY 5+] and [DEVASTATING WOUNDS] abilities.'
  const existingAbilityUpgrade =
    'Until the end of the phase, ranged weapons equipped by models in your unit have the [SUSTAINED HITS 1] ability while targeting an enemy unit within 12". If such a weapon already has that ability, until the end of the phase, each time an attack is made with that weapon, an unmodified Hit roll of 5+ scores a Critical Hit.'
  it.each(['Infantry', 'Vehicle'])('applies a named weapon replacement with target-specific Anti against %s', (target) => {
    const sheet = weapons()
    sheet.profiles[0]!.name = 'The Rifle'
    sheet.profiles.push({ ...sheet.profiles[0]!, id: 'other', name: 'Sidearm' })
    const active = [{ name: 'Buff', effects: combatRuleChoices(rule(weaponReplacement))[0]!.effects }]
    const projected = combatRuleProfiles(sheet, active, 'attacker', [target])
    expect(
      combatWeapons(projected, [target], 'ranged').map(({ weapon }) => ({
        damage: weapon?.damage.bonus,
        devastating: weapon?.devastating,
        criticalWound: weapon?.criticalWound,
      })),
    ).toEqual([
      { damage: 3, devastating: true, criticalWound: target === 'Infantry' ? 5 : 6 },
      { damage: 2, devastating: false, criticalWound: 6 },
    ])
  })
  it.each([false, true])('sets random damage before additive modifiers regardless of effect order (%s)', (reverse) => {
    const sheet = weapons()
    sheet.profiles[0]!.values.find((value) => value.name === 'D')!.value = 'D6'
    const buffs = [
      { name: 'Replacement', effects: combatRuleChoices(rule(weaponReplacement))[0]!.effects },
      {
        name: 'Bonus',
        effects: combatRuleChoices(rule('Add 1 to the Damage characteristic of ranged weapons equipped by this model.'))[0]!.effects,
      },
    ]
    if (reverse) buffs.reverse()
    expect(combatWeapons(combatRuleProfiles(sheet, buffs, 'attacker'), [], 'ranged')[0]?.weapon?.damage).toEqual({
      dice: 0,
      sides: 6,
      bonus: 4,
    })
  })
  it('checks existing abilities for each weapon before the same rule grants Sustained Hits', () => {
    const sheet = weapons()
    sheet.profiles.push({
      ...sheet.profiles[0]!,
      id: 'sustained',
      name: 'Burst rifle',
      values: sheet.profiles[0]!.values.map((value) => (value.name === 'Keywords' ? { ...value, value: 'Sustained Hits 1' } : value)),
    })
    const active = [{ name: 'Buff', effects: combatRuleChoices(rule(existingAbilityUpgrade, { scope: 'stratagem' }))[0]!.effects }]
    const used = combatWeapons(combatRuleProfiles(sheet, active, 'attacker'), [], 'ranged').map((entry) => ({ ...entry, count: 1 }))
    expect(
      combatRuleWeapons(sheet, used, active, 'attacker', 'ranged', []).map((weapon) => ({
        sustained: weapon.sustained,
        criticalHit: weapon.criticalHit ?? 6,
      })),
    ).toEqual([
      { sustained: 1, criticalHit: 6 },
      { sustained: 1, criticalHit: 5 },
    ])
  })
  it('counts a stronger Sustained Hits grant from a separate active source', () => {
    const sheet = weapons()
    const active = [
      { name: 'Buff', effects: combatRuleChoices(rule(existingAbilityUpgrade, { scope: 'stratagem' }))[0]!.effects },
      {
        name: 'Aura',
        effects: combatRuleChoices(rule('Ranged weapons equipped by models in this unit have the [SUSTAINED HITS 2] ability.'))[0]!.effects,
      },
    ]
    const used = combatWeapons(combatRuleProfiles(sheet, active, 'attacker'), [], 'ranged').map((entry) => ({ ...entry, count: 1 }))
    expect(combatRuleWeapons(sheet, used, active, 'attacker', 'ranged', [])[0]).toMatchObject({ sustained: 2, criticalHit: 5 })
  })
  it('does not apply a ranged existing-ability upgrade in melee', () => {
    const sheet = weapons()
    const active = [{ name: 'Buff', effects: combatRuleChoices(rule(existingAbilityUpgrade, { scope: 'stratagem' }))[0]!.effects }]
    const used = combatWeapons(combatRuleProfiles(sheet, active, 'attacker'), [], 'melee').map((entry) => ({ ...entry, count: 1 }))
    expect(combatRuleWeapons(sheet, used, active, 'attacker', 'melee', [])[0]).toMatchObject({ sustained: 0 })
    expect(combatRuleWeapons(sheet, used, active, 'attacker', 'melee', [])[0]?.criticalHit).toBeUndefined()
  })
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
    expect(
      combatRuleWeapons(weapons(), used, [{ name: 'Buff', effects }], 'attacker', 'ranged', ['Infantry'])[0]?.woundModifier,
    ).toBeUndefined()
  })
  it('applies a target-specific wound bonus to the matching named weapon', () => {
    const effects = combatRuleChoices(
      rule('Each time this model makes a ranged attack with its Rifle that targets a VEHICLE unit, add 1 to the Wound roll.'),
    )[0]!.effects
    const used = combatWeapons(weapons(), [], 'ranged').map((profile) => ({ ...profile, count: 1 }))
    expect(combatRuleWeapons(weapons(), used, [{ name: 'Buff', effects }], 'attacker', 'ranged', ['Vehicle'])[0]?.woundModifier).toBe(1)
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
  const unsupported = 'Weapons equipped by this unit have the [PRECISION] ability. These warriors are legends.'
  it('hides unsupported wording without requiring a classification', () =>
    expect(combatRuleAppliesTo(rule(unsupported), 'attacker')).toBe(false))
  it('keeps calculated offensive effects visible', () =>
    expect(combatRuleAppliesTo(rule('Weapons equipped by this unit have the [LETHAL HITS] ability.'), 'attacker')).toBe(true))
  it('keeps already applied profile changes visible', () =>
    expect(combatRuleAppliesTo(rule(unsupported, { included: true }), 'attacker')).toBe(true))
  it.each(['attacker', 'defender'] as const)('limits already applied defences to the defender when checking %s', (role) =>
    expect(combatRuleAppliesTo(rule('An unfamiliar defensive effect.', { appliedDefences: ['save'] }), role)).toBe(role === 'defender'),
  )
  it.each([
    ['While this model is leading a unit, weapons equipped by models in that unit have the [LETHAL HITS] ability.', 'defender'],
    ['Each time an attack targets this unit, subtract 1 from the Hit roll, unless that unit is within 6".', 'attacker'],
    ['Models in this unit have the Feel No Pain 5+ ability against mortal wounds and Psychic Attacks.', 'attacker'],
    ['At the end of your Command phase, this unit heals D3 wounds.', 'attacker'],
    ['At the end of your Command phase, this unit heals D3 wounds.', 'defender'],
  ] as const)('hides %s from the %s', (description, role) => expect(combatRuleAppliesTo(rule(description), role)).toBe(false))
  it('hides an unsupported defensive rule on the defender', () =>
    expect(
      combatRuleAppliesTo(
        rule('Each time an attack targets this unit, subtract 1 from the Hit roll, unless that unit is within 6".'),
        'defender',
      ),
    ).toBe(false))
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
