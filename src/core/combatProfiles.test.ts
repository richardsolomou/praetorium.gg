import { describe, expect, it } from 'vitest'
import type { Datasheet } from '../contracts/catalogue'
import { combatSurvivorSheet } from './combatSurvivors'
import { combatPlan, combatTarget, combatWeapons } from './combatProfiles'
import { wargearKey } from './wargear'

const sheet = (keywords = ''): Datasheet => ({
  id: 'unit',
  slug: 'unit',
  referenceRoute: null,
  name: 'Unit',
  points: null,
  keywords: [],
  profiles: [
    {
      id: 'model',
      name: 'Model',
      type: 'Unit',
      values: [
        { name: 'T', value: '4' },
        { name: 'Sv', value: '3+' },
        { name: 'W', value: '2' },
      ],
    },
    {
      id: 'weapon',
      name: 'Weapon',
      type: 'Ranged Weapons',
      count: 5,
      values: Object.entries({ A: 'D6', BS: '3+', S: '4', AP: '-1', D: '2', Keywords: keywords }).map(([name, value]) => ({ name, value })),
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

describe('combat profiles', () => {
  it.each(['Sustained Hits D3', 'Rapid Fire D6+3', 'Melta D3'])('parses a variable value for %s', (keyword) => {
    const weapon = combatWeapons(sheet(keyword), [], 'ranged')[0]?.weapon
    expect(keyword.startsWith('Sustained') ? weapon?.sustained : keyword.startsWith('Rapid') ? weapon?.rapidFire : weapon?.melta).toEqual(
      keyword.startsWith('Rapid') ? { dice: 1, sides: 6, bonus: 3 } : { dice: 1, sides: 3, bonus: 0 },
    )
  })
  it.each([
    ['Anti-Monster/Vehicle 3+', ['Vehicle'], 3],
    ['Anti-Monster/Vehicle 3+', ['Infantry'], 6],
    ['Anti-non-Monster/Vehicle 3+', ['Infantry'], 3],
    ['Anti-non-Monster/Vehicle 3+', ['Vehicle'], 6],
    ['Anti Vehicle 3+', ['Vehicle'], 3],
    ['Anti-fly 2', ['Fly'], 2],
  ])('resolves %s against %j', (keyword, targets, critical) => {
    expect(combatWeapons(sheet(keyword), targets, 'ranged')[0]?.weapon?.criticalWound).toBe(critical)
  })
  it.each(['Monster', 'Vehicle', 'Infantry'])('applies excluded target keywords to %s', (target) => {
    expect(combatWeapons(sheet('Lethal Hits: non-Monster/Vehicle'), [target], 'ranged')[0]?.weapon?.lethal).toBe(target === 'Infantry')
  })
  it('does not silently discard a malformed target condition', () => {
    expect(combatWeapons(sheet('Lethal Hits: non-'), ['Infantry'], 'ranged')[0]?.error).toContain('Unsupported')
  })
  it('recognizes a spaced Twin Linked keyword', () => {
    expect(combatWeapons(sheet('Twin Linked'), [], 'ranged')[0]?.weapon?.twinLinked).toBe(true)
  })
  it('uses Cleave to add attacks per five targets', () => {
    expect(combatWeapons(sheet('Cleave 2'), [], 'ranged')[0]?.weapon?.cleave).toBe(2)
  })
  it('recognizes One Shot as an explicit weapon eligibility condition', () => {
    expect(combatWeapons(sheet('One Shot'), [], 'ranged')[0]?.weapon?.oneShot).toBe(true)
  })
  it('excludes a One Shot weapon when the player marks it already fired', () => {
    const carriers = [{ name: 'Model', models: 5, weapons: [{ name: 'Weapon', count: 5 }] }]
    const plan = combatPlan(sheet('One Shot'), carriers, [], 'ranged')
    const spent = combatPlan(sheet('One Shot'), carriers, [], 'ranged', { [plan.choices[0]!.key]: 'spent' })
    expect({ count: plan.weapons[0]?.count, spent: spent.weapons, errors: spent.errors }).toEqual({ count: 5, spent: [], errors: [] })
  })
  it('offers mutually exclusive fixed and variable instances of the same weapon ability', () => {
    const carriers = [{ name: 'Model', models: 5, weapons: [{ name: 'Weapon', count: 5 }] }]
    const data = sheet('Sustained Hits D3, Sustained Hits 2')
    const initial = combatPlan(data, carriers, [], 'ranged')
    const fixed = combatPlan(data, carriers, [], 'ranged', { [initial.choices[0]!.key]: 'Sustained Hits 2' })
    expect({ initial: initial.weapons[0]?.sustained, fixed: fixed.weapons[0]?.sustained, errors: fixed.errors }).toEqual({
      initial: { dice: 1, sides: 3, bonus: 0 },
      fixed: 2,
      errors: [],
    })
  })
  it('uses surviving weapon counts for both projection and attack selection', () => {
    const original = [{ name: 'Model', models: 5, weapons: [{ name: 'Weapon', count: 5 }] }]
    const survivors = [{ name: 'Model', models: 3, weapons: [{ name: 'Weapon', count: 3 }] }]
    const plan = combatPlan(combatSurvivorSheet(sheet(), original, survivors), survivors, [], 'ranged')
    expect({ counts: plan.weapons.map((weapon) => weapon.count), errors: plan.errors }).toEqual({ counts: [3], errors: [] })
  })
  it('does not conceal an unmatched original profile when reducing casualties', () => {
    const original = [{ name: 'Model', models: 5, weapons: [{ name: 'Unknown', count: 5 }] }]
    expect(combatPlan(combatSurvivorSheet(sheet(), original, []), [], [], 'ranged').errors).toContain(
      'Weapon: equipped weapons could not be matched to their models.',
    )
  })
  it('removes a dead specialist weapon from attack selection', () => {
    const original = [{ name: 'Model', models: 5, weapons: [{ name: 'Weapon', count: 5 }] }]
    expect(combatPlan(combatSurvivorSheet(sheet(), original, []), [], [], 'ranged').used).toEqual([])
  })
  it('does not grant a bearer-only defence to an unidentified last survivor', () => {
    const data = sheet()
    data.abilities = [{ id: 'fnp', name: 'Feel No Pain 5+', kind: 'core', source: 'Armour', description: null }]
    expect(combatTarget(data, 1, 5).target?.feelNoPain).toBeNull()
  })
  it.each(['Pistol', '[PISTOL]', 'Pistol, Close-Quarters'])(
    'accepts %s as a close-quarters ability without losing damage rules',
    (keywords) => {
      expect(combatWeapons(sheet(`Devastating Wounds, ${keywords}`), [], 'ranged')[0]?.weapon?.devastating).toBe(true)
    },
  )
  it('uses the selected weapon count rather than the squad size', () => {
    expect(combatWeapons(sheet(), [], 'ranged')[0]?.weapon?.count).toBe(5)
  })
  it('does not offer ranged weapons in melee', () => expect(combatWeapons(sheet(), [], 'melee')).toEqual([]))
  it('refuses an unknown attack value instead of approximating it', () => {
    const data = sheet()
    data.profiles[1]!.values[0]!.value = 'D6+special'
    expect(combatWeapons(data, [], 'ranged')[0]?.weapon).toBeNull()
  })
  it('refuses a missing weapon count', () => {
    const data = sheet()
    delete data.profiles[1]!.count
    expect(combatWeapons(data, [], 'ranged')[0]?.weapon).toBeNull()
  })
  it.each([
    ['Vehicle', 4],
    ['Infantry', 6],
  ])('anti only applies to the %s target', (keyword, expected) => {
    expect(combatWeapons(sheet('Anti‑Vehicle 4+'), [keyword], 'ranged')[0]?.weapon?.criticalWound).toBe(expected)
  })
  it.each([
    ['Vehicle', true],
    ['Infantry', false],
  ])('conditional lethal hits respects %s', (keyword, expected) => {
    expect(combatWeapons(sheet('Lethal Hits: Vehicle'), [keyword], 'ranged')[0]?.weapon?.lethal).toBe(expected)
  })
  it('recognizes weapons that can use indirect shooting', () => {
    expect(combatWeapons(sheet('Indirect Fire'), [], 'ranged')[0]?.weapon?.indirectFire).toBe(true)
  })
  it('accepts a homogeneous target with several model names', () => {
    const data = sheet()
    data.profiles.push({ ...data.profiles[0]!, id: 'sergeant', name: 'Sergeant' })
    expect(combatTarget(data, 5).target).toEqual({
      groups: [{ models: 5, toughness: 4, save: 3, wounds: 2, invulnerable: null }],
      feelNoPain: null,
    })
  })
  it.each(['Feel No Pain 4+', '[FEEL NO PAIN 4+]'])('reads the printed %s core ability', (name) => {
    const data = sheet()
    data.abilities = [{ id: 'fnp', name, kind: 'core', description: null }]
    expect(combatTarget(data, 5).target?.feelNoPain).toBe(4)
  })
  it('uses the best Feel No Pain roll without stacking multiple abilities', () => {
    const data = sheet()
    data.abilities = [6, 4].map((roll) => ({ id: `fnp-${roll}`, name: `Feel No Pain ${roll}+`, kind: 'core', description: null }))
    expect(combatTarget(data, 5).target?.feelNoPain).toBe(4)
  })
  it('uses a granted Feel No Pain ability for a single model', () => {
    const data = sheet()
    data.abilities = [{ id: 'fnp', name: 'Feel No Pain 5+', kind: 'core', source: 'Armour', description: null }]
    expect(combatTarget(data, 1).target?.feelNoPain).toBe(5)
  })
  it('does not spread a grant with unknown bearer ownership across a squad', () => {
    const data = sheet()
    data.abilities = [{ id: 'fnp', name: 'Feel No Pain 5+', kind: 'core', source: 'Armour', description: null }]
    expect(combatTarget(data, 5).target?.feelNoPain).toBeNull()
  })
  it('does not apply a Feel No Pain roll restricted to specific wounds to all damage', () => {
    const data = sheet()
    data.abilities = [{ id: 'fnp', name: 'Feel No Pain 4+ against mortal wounds', kind: 'core', description: null }]
    expect(combatTarget(data, 5).target?.feelNoPain).toBeNull()
  })
  it('does not treat a Feel No Pain grant in ability prose as an intrinsic rule', () => {
    const data = sheet()
    data.abilities = [{ id: 'aura', name: 'Aura', kind: 'datasheet', description: 'Nearby models have the Feel No Pain 4+ ability.' }]
    expect(combatTarget(data, 5).target?.feelNoPain).toBeNull()
  })
  it('does not interpret an upgrade title as a core Feel No Pain ability', () => {
    const data = sheet()
    data.abilities = [{ id: 'upgrade', name: 'Feel No Pain 4+', kind: 'upgrade', description: null }]
    expect(combatTarget(data, 5).target?.feelNoPain).toBeNull()
  })
  const mixed = () => {
    const data = sheet()
    data.profiles.push({
      ...data.profiles[0]!,
      id: 'leader',
      name: 'Leader',
      values: [
        { name: 'T', value: '5' },
        { name: 'W', value: '3' },
        { name: 'Sv', value: '2+' },
      ],
    })
    return data
  }
  it('splits mixed defences into allocation groups counted from the carriers', () => {
    expect(
      combatTarget(mixed(), 5, 5, [
        { name: 'Model', models: 4, weapons: [] },
        { name: 'Leader', models: 1, weapons: [] },
      ]),
    ).toMatchObject({
      target: {
        groups: [
          { models: 4, toughness: 4, wounds: 2 },
          { models: 1, toughness: 5, wounds: 3, save: 2 },
        ],
      },
      labels: ['Model', 'Leader'],
    })
  })
  it('leaves a group with no surviving models out of the allocation order', () => {
    expect(
      combatTarget(mixed(), 4, 5, [
        { name: 'Model', models: 4, weapons: [] },
        { name: 'Leader', models: 0, weapons: [] },
      ]).labels,
    ).toEqual(['Model'])
  })
  it('refuses mixed defences when a carrier matches no model profile', () => {
    expect(combatTarget(mixed(), 5, 5, [{ name: 'Stranger', models: 5, weapons: [] }]).target).toBeNull()
  })
  it('refuses mixed defences when the carriers do not account for every model', () => {
    expect(combatTarget(mixed(), 5, 5, [{ name: 'Model', models: 4, weapons: [] }]).target).toBeNull()
  })
  it('refuses missing target stats', () => {
    const data = sheet()
    data.profiles[0]!.values = []
    expect(combatTarget(data, 5).target).toBeNull()
  })
  it('refuses an unfamiliar invulnerable save rather than removing it', () => {
    const data = sheet()
    data.profiles[0]!.values.push({ name: 'InSv', value: '4+ against ranged attacks' })
    expect(combatTarget(data, 5).target).toBeNull()
  })
})

const weaponProfile = (id: string, type: 'ranged' | 'melee', count: number, keywords = ''): Datasheet['profiles'][number] => ({
  id,
  name: id,
  type: type === 'ranged' ? 'Ranged Weapons' : 'Melee Weapons',
  count,
  values: Object.entries({ A: '2', [type === 'ranged' ? 'BS' : 'WS']: '3+', S: '4', AP: '-1', D: '1', Keywords: keywords }).map(
    ([name, value]) => ({ name, value }),
  ),
})
const carrier = (models: number, ...weapons: [string, number][]) => ({
  name: 'Models',
  models,
  weapons: weapons.map(([name, count]) => ({ name, count })),
})
const plan = (
  profiles: Datasheet['profiles'],
  carriers: Parameters<typeof combatPlan>[1],
  phase: 'ranged' | 'melee' = 'ranged',
  keywords: string[] = [],
) => combatPlan({ ...sheet(), profiles, keywords }, carriers, [], phase)
const selected = (result: ReturnType<typeof combatPlan>) => result.used.map(({ profile, count }) => [profile.name, count])

describe('automatic combat loadouts', () => {
  it.each(['Close-Quarters', 'Pistol'])('uses rifles without also adding the same models’ %s attacks', (keyword) => {
    expect(
      selected(
        plan(
          [weaponProfile('Rifle', 'ranged', 5), weaponProfile('Sidearm', 'ranged', 5, keyword)],
          [carrier(5, ['Rifle', 5], ['Sidearm', 5])],
        ),
      ),
    ).toEqual([['Rifle', 5]])
  })
  it.each(['Close-Quarters', 'Pistol'])('uses %s attacks when they are the only ranged weapons', (keyword) => {
    expect(selected(plan([weaponProfile('Sidearm', 'ranged', 5, keyword)], [carrier(5, ['Sidearm', 5])]))).toEqual([['Sidearm', 5]])
  })
  it.each(['Close-Quarters', 'Pistol'])('allows a vehicle to use %s and other ranged weapons together', (keyword) => {
    expect(
      selected(
        plan(
          [weaponProfile('Cannon', 'ranged', 1), weaponProfile('Sidearm', 'ranged', 1, keyword)],
          [carrier(1, ['Cannon', 1], ['Sidearm', 1])],
          'ranged',
          ['Vehicle'],
        ),
      ),
    ).toEqual([
      ['Cannon', 1],
      ['Sidearm', 1],
    ])
  })
  it('can switch from a rifle to the pistol group', () => {
    const data = { ...sheet(), profiles: [weaponProfile('Rifle', 'ranged', 1), weaponProfile('Sidearm', 'ranged', 1, 'Pistol')] }
    expect(selected(combatPlan(data, [carrier(1, ['Rifle', 1], ['Sidearm', 1])], [], 'ranged', { 'ranged:0:group': 'close' }))).toEqual([
      ['Sidearm', 1],
    ])
  })
  it('keeps a disabled weapon visible while omitting its attacks', () => {
    const data = { ...sheet(), profiles: [weaponProfile('Rifle', 'ranged', 1), weaponProfile('Grenade', 'ranged', 1)] }
    const selection = combatPlan(data, [carrier(1, ['Rifle', 1], ['Grenade', 1])], [], 'ranged', {}, new Set([wargearKey('Grenade')]))
    expect({
      shown: selection.used.map((entry) => entry.profile.name),
      active: selection.active.map((entry) => entry.profile.name),
    }).toEqual({
      shown: ['Rifle', 'Grenade'],
      active: ['Rifle'],
    })
  })
  it('keeps the same weapon disabled when its profile mode changes', () => {
    const data = {
      ...sheet(),
      profiles: [weaponProfile('Cannon (focused)', 'ranged', 1), weaponProfile('Cannon (dispersed)', 'ranged', 1)],
    }
    const selection = combatPlan(
      data,
      [carrier(1, ['Cannon', 1])],
      [],
      'ranged',
      { 'ranged:0:cannon': 'Cannon (dispersed)' },
      new Set([wargearKey('Cannon')]),
    )
    expect({ shown: selection.used[0]?.profile.name, weapons: selection.weapons }).toEqual({ shown: 'Cannon (dispersed)', weapons: [] })
  })
  it('does not let an excluded unsupported weapon block another weapon', () => {
    const data = { ...sheet(), profiles: [weaponProfile('Rifle', 'ranged', 1), weaponProfile('Grenade', 'ranged', 1, 'Unknown')] }
    const selection = combatPlan(data, [carrier(1, ['Rifle', 1], ['Grenade', 1])], [], 'ranged', {}, new Set([wargearKey('Grenade')]))
    expect(selection.errors).toEqual([])
  })
  it('combines a specialist with the other models’ melee weapons', () => {
    expect(
      selected(
        plan(
          [weaponProfile('Fist', 'melee', 1), weaponProfile('Blade', 'melee', 4)],
          [carrier(1, ['Fist', 1]), carrier(4, ['Blade', 4])],
          'melee',
        ),
      ),
    ).toEqual([
      ['Fist', 1],
      ['Blade', 4],
    ])
  })
  it('uses one normal melee weapon per model plus Extra Attacks', () => {
    expect(
      selected(
        plan(
          [weaponProfile('Sword', 'melee', 2), weaponProfile('Axe', 'melee', 2), weaponProfile('Tail', 'melee', 2, 'Extra Attacks')],
          [carrier(2, ['Sword', 2], ['Axe', 2], ['Tail', 2])],
          'melee',
        ),
      ),
    ).toEqual([
      ['Sword', 2],
      ['Tail', 2],
    ])
  })
  it('fills remaining models with their shared melee weapon', () => {
    expect(
      selected(
        plan([weaponProfile('Fist', 'melee', 1), weaponProfile('Blade', 'melee', 5)], [carrier(5, ['Fist', 1], ['Blade', 5])], 'melee'),
      ),
    ).toEqual([
      ['Fist', 1],
      ['Blade', 4],
    ])
  })
  it('does not guess which models share multiple partial melee allocations', () => {
    expect(
      plan([weaponProfile('Fist', 'melee', 2), weaponProfile('Sword', 'melee', 2)], [carrier(5, ['Fist', 2], ['Sword', 2])], 'melee')
        .errors,
    ).toEqual(['Models: melee allocation needs individual model ownership.'])
  })
  it('does not silently drop weapons whose carrier is missing', () => {
    expect(plan([weaponProfile('Rifle', 'ranged', 5)], []).errors).toEqual([
      'Rifle: equipped weapons could not be matched to their models.',
    ])
  })
  it('chooses only one mode of the same weapon', () => {
    expect(
      selected(
        plan(
          [weaponProfile('Cannon (focused)', 'ranged', 1), weaponProfile('Cannon (dispersed)', 'ranged', 1)],
          [carrier(1, ['Cannon', 1])],
        ),
      ),
    ).toEqual([['Cannon (focused)', 1]])
  })
  it('honours a chosen alternate profile', () => {
    const data = {
      ...sheet(),
      profiles: [weaponProfile('Cannon (focused)', 'ranged', 1), weaponProfile('Cannon (dispersed)', 'ranged', 1)],
    }
    expect(selected(combatPlan(data, [carrier(1, ['Cannon', 1])], [], 'ranged', { 'ranged:0:cannon': 'Cannon (dispersed)' }))).toEqual([
      ['Cannon (dispersed)', 1],
    ])
  })
  it('passes inherited profile characteristics and granted abilities into the calculation', () => {
    const data = sheet('Lethal Hits')
    data.profiles[1]!.values[0] = { name: 'A', value: '4', baseValue: '2', modifiers: ['Detachment'] }
    expect(combatPlan(data, [carrier(5, ['Weapon', 5])], [], 'ranged').weapons[0]).toMatchObject({ attacks: { bonus: 4 }, lethal: true })
  })
})
