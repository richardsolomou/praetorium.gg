import { describe, expect, it } from 'vitest'
import {
  canAddPooledOption,
  changedDraftSpreadCounts,
  choiceRemoval,
  donorPriority,
  increaseBlocked,
  type LoadoutChoice,
  type LoadoutModel,
  loadoutFixedCount,
  loadoutRowCount,
  loadoutInstructions,
  modelCount,
  ordered,
  orderedModelWargear,
  poolChangeUpdates,
  pressedCounts,
  poolHandlers,
  relativeSpread,
  orderedChoices,
  replacementChoice,
  spreadHandlers,
  uniqueWeaponProfiles,
  unmodeledGrantedWeapons,
  optionNameMatches,
  weaponProfilesFor,
  wholeSquadTakes,
  withDraftSpreadCounts,
} from './loadoutModel'
import { sameWargear } from '../../../../core/wargear'

const option = (id: string, count: number, max: number) => ({ id, name: id, points: 0, count, min: 0, max })

const choice = (options: LoadoutChoice['options'], room: number, optional = false): LoadoutChoice => ({
  key: 'group',
  name: 'Group',
  chosen: '',
  optional,
  carried: false,
  room,
  uniform: false,
  owner: null,
  options,
})

const weapon = (name: string, type: string) => ({ id: name, name, type, values: [] })

it('shows an equipped enhancement weapon outside the model loadout without repeating its other weapons', () => {
  const model: LoadoutModel = {
    name: 'Captain',
    fixed: [{ name: 'Heavy Bolt Pistol' }],
    members: [{ id: 'captain', choiceKey: null, baseCount: 1 }],
    rows: [{ name: 'Master-crafted Power Weapon', choiceKey: 'melee', optionId: 'power-weapon' }],
  }
  expect(
    unmodeledGrantedWeapons(
      [
        weapon('Heavy Bolt Pistol', 'Ranged Weapons'),
        weapon('Master-crafted Power Weapon', 'Melee Weapons'),
        weapon("Imperium's Sword", 'Melee Weapons'),
        weapon('Particle beamer', 'Ranged Weapons'),
      ],
      [model],
      [
        choice([{ ...option('sword', 1, 1), name: "Imperium's Sword", pieceCounts: [{ name: "Imperium's Sword", count: 1 }] }], 1, true),
      ].map((entry) => ({ ...entry, kind: 'enhancement' as const })),
    ).map((profile) => profile.name),
  ).toEqual(["Imperium's Sword"])
})

describe('loadout instructions', () => {
  const trooper: LoadoutModel = { name: 'Trooper', fixed: [], members: [], rows: [] }
  const leader: LoadoutModel = { ...trooper, name: 'Leader' }

  it('uses the rule for the complete pair rather than another loadout sharing its blade', () => {
    expect(
      loadoutInstructions(
        { name: 'Rifle and Blade', pieces: ['Rifle', 'Blade'] },
        trooper,
        [trooper],
        [
          { instruction: 'Take Rifle and Blade together.', options: ['Rifle', 'Blade'] },
          { instruction: 'Take Cannon and Blade together.', options: ['Cannon', 'Blade'] },
        ],
      ),
    ).toEqual(['Take Rifle and Blade together.'])
  })

  it('keeps a leader restriction off the same weapon offered to ordinary troops', () => {
    expect(
      loadoutInstructions(
        { name: 'Plasma gun' },
        trooper,
        [trooper, leader],
        [
          { instruction: 'The Leader can replace their rifle with a plasma gun.', options: ['Plasma gun'] },
          { instruction: 'One Trooper can take one of these weapons.', options: ['Plasma gun', 'Meltagun'] },
        ],
      ),
    ).toEqual(['One Trooper can take one of these weapons.'])
  })

  it('reads which model a published instruction names from its loaded words', () => {
    expect(
      loadoutInstructions(
        { name: 'Plasma gun' },
        trooper,
        [trooper, leader],
        [
          { instruction: '⟦a1⟧', options: ['Plasma gun'] },
          { instruction: '⟦b2⟧', options: ['Plasma gun', 'Meltagun'] },
        ],
        (instruction) =>
          instruction === '⟦a1⟧' ? 'The Leader can replace their rifle with a plasma gun.' : 'One Trooper can take one of these weapons.',
      ),
    ).toEqual(['⟦b2⟧'])
  })

  it('matches a wargear ability with a source suffix without inventing a rule for a default weapon', () => {
    expect(
      loadoutInstructions(
        { name: 'Rifle and Icon', pieces: ['Rifle', 'Icon'] },
        trooper,
        [trooper],
        [
          { instruction: 'Default Wargear', options: ['Rifle'] },
          { instruction: 'One model can carry an icon.', options: ['Icon (Aura)'] },
        ],
      ),
    ).toEqual(['One model can carry an icon.'])
  })
})

it('does not remove a mandatory copy while allowing an additional copy', () => {
  const gauntlet = { ...option('gauntlet', 1, 2), min: 1 }
  const handlers = spreadHandlers(choice([gauntlet], 2))

  expect(handlers.less(gauntlet)).toBeUndefined()
  expect(handlers.more(gauntlet)?.({ gauntlet: 1 })).toEqual({ gauntlet: 2 })
})

it('applies pending draft counts without replacing untouched evaluated counts', () => {
  const group = choice([option('blaster', 8, 10), option('carbine', 2, 10), option('special', 0, 1)], 10)

  expect(withDraftSpreadCounts([group], { group: { blaster: 7, carbine: 3 } })[0]?.options.map(({ count }) => count)).toEqual([7, 3, 0])
})

it('keeps only spread groups changed since the evaluated result', () => {
  const evaluated = { weapons: { blaster: 8, carbine: 2 }, settled: { invalid: 3 } }
  const current = { weapons: { blaster: 7, carbine: 3 }, settled: { invalid: 3 } }

  expect(changedDraftSpreadCounts(current, evaluated)).toEqual({ weapons: current.weapons })
})

describe('matching a wargear name to what describes it', () => {
  it('reads a parenthesised mode as the same weapon', () => {
    expect(sameWargear('Staff of light', 'Staff of light (Melee)')).toBe(true)
    expect(sameWargear('Staff of light (Ranged)', 'Staff of light (Melee)')).toBe(true)
  })

  it.each([
    ['➤ Bellicatus missile array - Frag', 'Bellicatus missile array (Icarus)'],
    ['➤ Plasma pistol - Supercharge', 'Plasma pistol (Standard)'],
  ])('reads marked and parenthesised modes as the same weapon', (marked, parenthesised) => {
    expect(sameWargear(marked, parenthesised)).toBe(true)
  })

  it('keeps two different weapons apart', () => {
    expect(sameWargear('Gauss flayer', 'Gauss reaper')).toBe(false)
  })

  it('matches straight and curly apostrophes', () => {
    expect(sameWargear("Dragon's Breath Flamer", 'Dragon’s breath flamer')).toBe(true)
  })

  it('keeps marked profiles of different weapons apart', () => {
    expect(sameWargear('➤ Bellicatus missile array - Frag', 'Multi-melta (Melta)')).toBe(false)
  })

  it('matches a profile named after the option, with or without a mode', () => {
    expect(optionNameMatches('Bolt rifle', 'Bolt rifle')).toBe(true)
    expect(optionNameMatches('Bolt rifle', 'Bolt rifle (Heavy)')).toBe(true)
    expect(optionNameMatches('Bolt rifle', 'Bolt pistol')).toBe(false)
  })

  it('matches a profile the option pairs with something else', () => {
    expect(optionNameMatches('Chainsword and bolt pistol', 'Chainsword')).toBe(true)
  })

  it('matches spacing differences between an option and its profile', () => {
    expect(optionNameMatches('Veteran w/ Black Shield blades', 'Blackshield blades')).toBe(true)
  })

  it('matches a marked, hyphen-separated mode such as a missile launcher prints', () => {
    expect(optionNameMatches('Missile Launcher', '➤ Missile Launcher - Frag')).toBe(true)
    expect(optionNameMatches('Missile Launcher', '➤ Missile Launcher - Krak')).toBe(true)
    expect(optionNameMatches('Missile Launcher', '➤ Multi-melta - Melta')).toBe(false)
  })

  it('matches marked modes of one weapon in a combined option', () => {
    expect(optionNameMatches('Cyclone Missile Launcher & Storm Bolter', '➤ Cyclone missile launcher - frag')).toBe(true)
    expect(optionNameMatches('Cyclone Missile Launcher & Storm Bolter', '➤ Cyclone missile launcher - krak')).toBe(true)
  })

  it('finds the selected weapons nested inside a composite option', () => {
    const profiles = [
      weapon('Bolt pistol', 'Ranged Weapons'),
      weapon('Master-crafted bolter', 'Ranged Weapons'),
      weapon('Close combat weapon', 'Melee Weapons'),
    ]

    expect(
      weaponProfilesFor(
        {
          name: 'Bolt Pistol, Master-crafted Bolter, Melee Weapon',
          pieces: ['Bolt pistol', 'Master-crafted bolter', 'Close combat weapon'],
        },
        profiles,
      ).map((profile) => profile.name),
    ).toEqual(['Bolt pistol', 'Master-crafted bolter', 'Close combat weapon'])
  })

  it('keeps the single fist profile out of a bundle containing dual fists', () => {
    expect(
      weaponProfilesFor({ name: 'Dual Caestus Fists + 2 Projectors', pieces: ['Dual Caestus Fists', 'Projectors'] }, [
        weapon('Dual Caestus Fists', 'Melee Weapons'),
        weapon('Caestus Fist', 'Melee Weapons'),
        weapon('Projectors', 'Ranged Weapons'),
      ]).map((profile) => profile.name),
    ).toEqual(['Dual Caestus Fists', 'Projectors'])
  })

  it('keeps marked and unmarked firing modes on structured equipment', () => {
    expect(
      weaponProfilesFor({ name: 'Launcher and Blade', pieces: ['Launcher', 'Blade'] }, [
        weapon('➤ Launcher - Frag', 'Ranged Weapons'),
        weapon('Launcher - Krak', 'Ranged Weapons'),
        weapon('Blade', 'Melee Weapons'),
      ]).map((profile) => profile.name),
    ).toEqual(['➤ Launcher - Frag', 'Launcher - Krak', 'Blade'])
  })

  it.each([undefined, ['Melta Rifle']])('shows both Melta Rifle profiles with equipment pieces %s', (pieces) => {
    expect(
      weaponProfilesFor({ name: 'Melta Rifle', pieces }, [
        { ...weapon('➤ Melta Rifle', 'Ranged Weapons'), equipmentName: 'Melta Rifle' },
        { ...weapon('➤ Melta Rifle HUNTER:Monster/Vehicle', 'Ranged Weapons'), equipmentName: 'Melta Rifle' },
        { ...weapon('➤ Multi-melta HUNTER:Monster/Vehicle', 'Ranged Weapons'), equipmentName: 'Multi-melta' },
      ]).map((profile) => profile.name),
    ).toEqual(['➤ Melta Rifle', '➤ Melta Rifle HUNTER:Monster/Vehicle'])
  })

  it('matches an unrelated profile name through its equipment owner', () => {
    expect(
      weaponProfilesFor({ name: 'Rifle', pieces: ['Rifle'] }, [
        { ...weapon('Special target', 'Ranged Weapons'), equipmentName: 'Rifle' },
        { ...weapon('Other mode', 'Ranged Weapons'), equipmentName: 'Other weapon' },
      ]).map((profile) => profile.name),
    ).toEqual(['Special target'])
  })

  it('keeps bundle profiles in equipment order when the available profiles change order', () => {
    expect(
      weaponProfilesFor({ name: 'Cannon and Fist and Projector', pieces: ['Cannon', 'Fist', 'Projector'] }, [
        weapon('Projector', 'Ranged Weapons'),
        weapon('Fist', 'Melee Weapons'),
        weapon('Cannon', 'Ranged Weapons'),
      ]).map((profile) => profile.name),
    ).toEqual(['Cannon', 'Fist', 'Projector'])
  })

  it('collapses equivalent profiles whose names differ only in presentation', () => {
    const profiles = [
      { ...weapon('Storm Bolter', 'Ranged Weapons'), id: 'sergeant', values: [{ name: 'BS', value: '3+' }] },
      { ...weapon('Storm bolter', 'Ranged Weapons'), id: 'terminator', values: [{ name: 'BS', value: '3+' }] },
    ]

    expect(uniqueWeaponProfiles(profiles).map(({ id }) => id)).toEqual(['sergeant'])
  })

  it('preserves genuinely different profiles of the same weapon', () => {
    const profiles = [
      { ...weapon('Storm Bolter', 'Ranged Weapons'), id: 'standard', values: [{ name: 'BS', value: '3+' }] },
      { ...weapon('Storm bolter', 'Ranged Weapons'), id: 'improved', values: [{ name: 'BS', value: '2+' }] },
    ]

    expect(uniqueWeaponProfiles(profiles).map(({ id }) => id)).toEqual(['standard', 'improved'])
  })
})

describe('reading model-card rows', () => {
  const owner = { id: 'terminator', name: 'Terminator', profile: 'Terminator' }
  const group = (key: string, chosen: string, ...options: LoadoutChoice['options']): LoadoutChoice => ({
    key,
    name: key,
    chosen,
    optional: false,
    carried: false,
    room: 1,
    uniform: false,
    owner,
    options,
  })

  it('adds the counts of same-named rows from separate choices', () => {
    const row = {
      name: 'Accursed weapon',
      choiceKey: 'left',
      optionId: 'left-weapon',
      alternatives: [{ choiceKey: 'right', optionId: 'right-weapon' }],
    }
    const choices = [
      group('left', 'left-weapon', option('left-weapon', 1, 1)),
      group('right', 'right-weapon', option('right-weapon', 1, 1)),
    ]

    expect(loadoutRowCount(row, choices)).toBe(2)
  })

  it('replaces only a composite option that contains the requested weapon', () => {
    const stormBolter = { name: 'Storm Bolter', choiceKey: 'guns', optionId: 'storm-bolter' }
    const chainfist = { name: 'Chainfist', choiceKey: 'fists', optionId: 'chainfist' }
    const cyclone = {
      name: 'Cyclone Missile Launcher & Storm Bolter',
      choiceKey: 'heavy',
      optionId: 'cyclone',
      pieces: ['Cyclone missile launcher', 'Storm bolter'],
    }
    const model: LoadoutModel = {
      name: 'Terminator',
      fixed: [],
      members: [],
      rows: [stormBolter, chainfist, cyclone],
    }
    const choices = [
      group('guns', 'storm-bolter', option('storm-bolter', 3, 5)),
      group('fists', 'power-fist', option('power-fist', 4, 5), option('chainfist', 0, 5)),
      group('heavy', 'cyclone', option('cyclone', 1, 1)),
    ]

    expect(replacementChoice(stormBolter, model, choices, 5)?.key).toBe('heavy')
    expect(replacementChoice(chainfist, model, choices, 5)).toBeNull()
  })

  it('removes optional choices and model-specific composite replacements', () => {
    const selected = option('cyclone', 1, 1)

    expect(choiceRemoval({ ...group('heavy', 'cyclone', selected), optional: true }, selected, false)).toBe('')
    expect(choiceRemoval(group('heavy', 'cyclone', selected), selected, true)).toBe('')
    expect(choiceRemoval(group('fist', 'power-fist', selected), selected, false)).toBeNull()
  })

  it('allows one full-pool replacement without exceeding the resulting maximum', () => {
    const donor = { choice: group('guns', 'rifle', option('rifle', 1, 1)), option: option('rifle', 1, 1) }
    const special = { ...option('special', 0, 0), replacements: [{ choiceKey: 'guns', optionId: 'rifle' }] }

    expect(canAddPooledOption(special, donor)).toBe(true)
    expect(canAddPooledOption(option('special', 1, 1), donor)).toBe(false)
    expect(canAddPooledOption(special)).toBe(false)
  })
})

describe('ordering the rows on a model card', () => {
  const weapons = [
    weapon('Bolt carbine', 'Ranged Weapons'),
    weapon('Combat knife', 'Melee Weapons'),
    weapon('Combi-weapon', 'Ranged Weapons'),
    weapon('Combi-weapon', 'Melee Weapons'),
  ]

  it('puts everything shot with before everything swung with', () => {
    const rows = [{ name: 'Combat knife' }, { name: 'Bolt carbine' }]
    expect(ordered(rows, weapons, (entry) => entry.name).map((entry) => entry.name)).toEqual(['Bolt carbine', 'Combat knife'])
  })

  it('keeps a combi-weapon among the guns even though it also fights', () => {
    const rows = [{ name: 'Combat knife' }, { name: 'Combi-weapon' }]
    expect(ordered(rows, weapons, (entry) => entry.name).map((entry) => entry.name)).toEqual(['Combi-weapon', 'Combat knife'])
  })

  it('keeps a cluster together, in the place its first entry earns', () => {
    const rows = [{ name: 'Bolt carbine' }, { name: 'Plasma pistol' }, { name: 'Combat knife' }]
    const clusterOf = (entry: { name: string }) => (entry.name === 'Combat knife' ? 'wargear:Bolt carbine' : `wargear:${entry.name}`)
    // The knife travels with the carbine it is traded for, ahead of the pistol.
    expect(ordered(rows, [...weapons, weapon('Plasma pistol', 'Ranged Weapons')], clusterOf).map((entry) => entry.name)).toEqual([
      'Bolt carbine',
      'Combat knife',
      'Plasma pistol',
    ])
  })
})

describe('ordering the questions the unit answers as a whole', () => {
  const weapons = [
    weapon('Overlord\u2019s blade', 'Melee Weapons'),
    weapon('Tachyon arrow', 'Ranged Weapons'),
    weapon('Hyperphase sword', 'Melee Weapons'),
  ]
  const group = (name: string, ...carried: string[]) => ({ name, options: carried.map((held) => ({ name: held })) })

  it('asks what the unit fights with before what else it carries', () => {
    const choices = [group('Wargear', 'Resurrection orb'), group('Weapons', 'Overlord\u2019s blade', 'Tachyon arrow')]
    expect(orderedChoices(choices, weapons).map((entry) => entry.name)).toEqual(['Weapons', 'Wargear'])
  })

  it('keeps guns ahead of blades, and leaves the rest as the datasheet has them', () => {
    const choices = [
      group('Melee', 'Hyperphase sword'),
      group('Relic', 'Veil of darkness'),
      group('Ranged', 'Tachyon arrow'),
      group('Trinket', 'Phylactery'),
    ]
    expect(orderedChoices(choices, weapons).map((entry) => entry.name)).toEqual(['Ranged', 'Melee', 'Relic', 'Trinket'])
  })

  it('counts a group as weapons when any option in it has a profile', () => {
    // The point of most such groups is that one option is a gun and the other is not.
    const choices = [group('Wargear', 'Resurrection orb'), group('Arm', 'Tachyon arrow', 'Nothing at all')]
    expect(orderedChoices(choices, weapons).map((entry) => entry.name)).toEqual(['Arm', 'Wargear'])
  })
})

describe('a group the whole squad answers at once', () => {
  it('hands every model the option that was picked', () => {
    const group = choice([option('gauss', 5, 5), option('tesla', 0, 5)], 5)
    expect(wholeSquadTakes(group, 'tesla')).toEqual({ gauss: 0, tesla: 5 })
    expect(wholeSquadTakes(group, 'gauss')).toEqual({ gauss: 5, tesla: 0 })
  })
})

describe('dividing a group between its options', () => {
  const held = (group: LoadoutChoice) => Object.fromEntries(group.options.map((entry) => [entry.id, entry.count]))

  it('fills the spare room before asking a sibling for anything', () => {
    const group = choice([option('blaster', 3, 10), option('carbine', 0, 10)], 5)
    expect(spreadHandlers(group).more(group.options[1]!)?.(held(group))).toEqual({ carbine: 1 })
  })

  it('takes from whichever sibling has the most once the group is full', () => {
    const group = choice([option('blaster', 8, 10), option('carbine', 2, 10)], 10)
    expect(spreadHandlers(group).more(group.options[1]!)?.(held(group))).toEqual({ carbine: 3, blaster: 7 })
  })

  it("takes from the group's default before replacing another specialist", () => {
    const boltgun = { ...option('boltgun', 1, 4), default: true }
    const heavy = option('heavy', 2, 2)
    const spewer = option('spewer', 0, 1)
    const group = choice([heavy, boltgun, spewer], 3)

    expect(spreadHandlers(group).more(spewer)?.(held(group))).toEqual({ spewer: 1, boltgun: 0 })
    expect([heavy, boltgun].toSorted(donorPriority)[0]).toBe(boltgun)
  })

  it('takes from a minimum that the catalogue changes for its sibling', () => {
    const regular = { ...option('regular', 4, 9), min: 4, mutableMin: true }
    const group = choice([regular, option('specialist', 0, 2)], 4)

    expect(spreadHandlers(group).more(group.options[1]!)?.(held(group))).toEqual({ specialist: 1, regular: 3 })
  })

  it('does not take a mutable minimum below zero on a later press', () => {
    const regular = { ...option('regular', 1, 9), min: 4, mutableMin: true }
    const group = choice([regular, option('specialist', 0, 2)], 1)
    const more = spreadHandlers(group).more(group.options[1]!)
    const first = more?.(held(group))

    expect(more?.({ ...held(group), ...first })).toBeNull()
  })

  it("refuses to exceed an option's own cap", () => {
    const group = choice([option('blaster', 9, 10), option('special', 1, 1)], 10)
    expect(spreadHandlers(group).more(group.options[1]!)).toBeUndefined()
  })

  it('hands a freed place to a sibling still under its cap', () => {
    const group = choice([option('blaster', 9, 10), option('special', 1, 1)], 10)
    expect(spreadHandlers(group).less(group.options[1]!)?.(held(group))).toEqual({ special: 0, blaster: 10 })
  })

  it('refuses to empty an option when no sibling can take its place', () => {
    const group = choice([option('blaster', 9, 9), option('special', 1, 1)], 10)
    expect(spreadHandlers(group).less(group.options[1]!)).toBeUndefined()
  })

  it('simply removes one when the group may hold fewer', () => {
    const group = choice([option('blaster', 9, 10), option('special', 1, 1)], 10, true)
    expect(spreadHandlers(group).less(group.options[1]!)?.(held(group))).toEqual({ special: 0 })
  })

  it('has nothing to remove from an empty option', () => {
    const group = choice([option('blaster', 10, 10), option('special', 0, 1)], 10)
    expect(spreadHandlers(group).less(group.options[1]!)).toBeUndefined()
  })

  it('folds a second press against the first without a new priced answer', () => {
    const group = choice([option('blaster', 3, 3), option('carbine', 0, 3)], 3)
    const more = spreadHandlers(group).more(group.options[1]!)
    const first = more?.(held(group))

    expect(more?.({ ...held(group), ...first })).toEqual({ carbine: 2, blaster: 1 })
  })

  it('offers no add that the counts the pick saved would refuse', () => {
    const group = choice([option('blaster', 3, 3), option('carbine', 0, 1)], 3)
    expect(spreadHandlers(group, { blaster: 2, carbine: 1 }).more(group.options[1]!)).toBeUndefined()
  })

  it('folds against the built counts once the saved ones overflow the group', () => {
    const group = choice([option('lasgun', 0, 2), option('plasma', 1, 1), option('melta', 1, 1)], 2)
    expect(pressedCounts(group, { lasgun: 2, plasma: 1, melta: 1 })).toEqual({ lasgun: 0, plasma: 1, melta: 1 })
  })

  it('turns a pooled result into the same change against newer counts', () => {
    const group = choice([option('blaster', 3, 3), option('carbine', 0, 3)], 3)
    const update = relativeSpread(group, { blaster: 2, carbine: 1 })

    expect(update({ blaster: 2, carbine: 1 })).toEqual({ blaster: 1, carbine: 2 })
  })

  describe('applying a press across a squad and a group nested under it', () => {
    const squad = { ...choice([{ ...option('boltgun', 3, 3), default: true }], 3), key: 'squad' }
    const special = { ...choice([option('melta', 1, 2)], 2, true), key: 'squad/special' }
    const updates = (change: [string, Record<string, number>][]) =>
      Object.fromEntries(poolChangeUpdates(change, [squad, special]).map(([key, update]) => [key, update({ boltgun: 3, melta: 1 })]))

    it('lets the squad take back a body its nested specialist freed beyond the cap it was priced with', () => {
      expect(
        updates([
          ['squad/special', { melta: 0 }],
          ['squad', { boltgun: 4 }],
        ]).squad,
      ).toEqual({ boltgun: 4 })
    })

    it('keeps the priced cap when nothing nested was freed', () => {
      expect(updates([['squad', { boltgun: 4 }]]).squad).toBeNull()
    })
  })
})

describe('putting a weapon down on a model card', () => {
  const card = (rows: LoadoutModel['rows'], members: LoadoutModel['members'] = []): LoadoutModel => ({
    name: 'Card',
    fixed: [],
    members,
    rows,
  })
  const rowFor = (id: string, name = id) => ({ name, choiceKey: 'group', optionId: id })

  it('replaces a melee loadout with a ranged pairing from the same choice', () => {
    const group = { ...choice([option('axe', 1, 2), option('pair', 0, 2)], 2), carried: true }
    const model = card(
      [rowFor('axe'), { ...rowFor('pair'), pieces: ['Rifle', 'Blade'] }],
      [{ id: 'leader', choiceKey: null, baseCount: 1 }],
    )
    expect(poolHandlers(model, [group], [weapon('axe', 'Melee Weapons'), weapon('Rifle', 'Ranged Weapons')]).spend(model.rows[1]!)).toEqual(
      [['group', { axe: 0, pair: 1 }]],
    )
  })

  it('leaves the squad an ordinary model where the group holds nothing but specialists', () => {
    const group = choice([option('meltagun', 1, 2), option('plasma', 1, 2), option('belcher', 0, 2)], 2, true)
    const model = card([rowFor('meltagun'), rowFor('plasma'), rowFor('belcher')])

    expect(poolHandlers(model, [group], []).free(model.rows[0]!)).toEqual([['group', { meltagun: 0 }]])
  })

  it('hands the freed place back to the loadout the squad starts with', () => {
    const rifle = { ...option('rifle', 2, 3), default: true }
    const group = choice([rifle, option('melta', 1, 1)], 3, true)
    const model = card([rowFor('rifle'), rowFor('melta')])

    expect(poolHandlers(model, [group], []).free(model.rows[1]!)).toEqual([['group', { melta: 0, rifle: 3 }]])
  })

  it('hands the freed place to a sibling where the group has to stay full', () => {
    const group = choice([option('ordinary', 2, 3), option('special', 1, 3)], 3)
    const model = card([rowFor('ordinary'), rowFor('special')])

    expect(poolHandlers(model, [group], []).free(model.rows[1]!)).toEqual([['group', { special: 0, ordinary: 3 }]])
  })

  it('has nothing to put down on an empty row', () => {
    const group = choice([option('meltagun', 0, 2), option('plasma', 1, 2)], 2, true)
    const model = card([rowFor('meltagun'), rowFor('plasma')])

    expect(poolHandlers(model, [group], []).free(model.rows[0]!)).toBeNull()
  })

  it('counts the models a card stands for from the choices its members point at', () => {
    const group = choice([option('meltagun', 1, 2), option('plasma', 1, 2)], 2, true)
    const model = card(
      [rowFor('meltagun'), rowFor('plasma')],
      [
        { id: 'meltagun', choiceKey: 'group', baseCount: 0 },
        { id: 'plasma', choiceKey: 'group', baseCount: 0 },
      ],
    )

    expect(modelCount(model, [group])).toBe(2)
  })

  it('counts a fixed weapon once for each copy its models carry', () => {
    const group = choice([option('single', 3, 3), option('twin', 1, 1)], 4)
    const model = card(
      [],
      [
        { id: 'single', choiceKey: 'group', baseCount: 0 },
        { id: 'twin', choiceKey: 'group', baseCount: 0 },
      ],
    )

    expect(loadoutFixedCount(model, { name: 'Hand flamer', each: { twin: 2 } }, [group])).toBe(5)
  })

  it('changes one factored weapon choice without changing the other', () => {
    const variants = [
      { ...option('claws-beamer', 0, 3), name: 'Wraith w/ claws and beamer', pieces: ['Vicious claws', 'Transdimensional beamer'] },
      { ...option('claws-caster', 0, 3), name: 'Wraith w/ claws and particle caster', pieces: ['Vicious claws', 'Particle caster'] },
      { ...option('claws', 0, 3), name: 'Wraith w/ claws', pieces: ['Vicious claws'], default: true },
      { ...option('coils', 1, 3), name: 'Wraith w/ coils', pieces: ['Whip coils'] },
      { ...option('coils-beamer', 0, 3), name: 'Wraith w/ coils and beamer', pieces: ['Whip coils', 'Transdimensional beamer'] },
      { ...option('coils-caster', 2, 3), name: 'Wraith w/ coils and particle caster', pieces: ['Whip coils', 'Particle caster'] },
    ]
    const group = { ...choice(variants, 3), key: 'models' }
    const row = (name: string, ...ids: string[]) => ({
      name,
      choiceKey: 'models',
      optionId: ids[0]!,
      alternatives: ids.slice(1).map((optionId) => ({ choiceKey: 'models', optionId })),
    })
    const model = card(
      [
        row('Vicious claws', 'claws-beamer', 'claws-caster', 'claws'),
        row('Transdimensional beamer', 'claws-beamer', 'coils-beamer'),
        row('Particle caster', 'claws-caster', 'coils-caster'),
        row('Whip coils', 'coils', 'coils-beamer', 'coils-caster'),
      ],
      variants.map((variant) => ({ id: variant.id, choiceKey: 'models', baseCount: 0 })),
    )
    const handlers = poolHandlers(model, [group], [])

    expect(handlers.spend(model.rows[1]!)).toEqual([['models', { 'coils-beamer': 1, coils: 0 }]])
    expect(handlers.free(model.rows[2]!)).toEqual([['models', { 'coils-caster': 1, coils: 2 }]])
    expect(handlers.spend(model.rows[0]!)).toEqual([['models', { 'claws-caster': 1, 'coils-caster': 1 }]])
  })
})

describe('a specialist card whose squadmates stand on another card', () => {
  // A Tempestus Command Squad files its armed Scions apart from the standard bearer and
  // vox-caster, so the body a standard bearer needs is on the Scions' card.
  const scions: LoadoutChoice = {
    ...choice(
      [
        { ...option('scion', 4, 4), default: true, pieces: ['Hot-shot lasgun'] },
        { ...option('standard', 0, 1), pieces: ['Regimental standard', 'Hot-shot lasgun'] },
        { ...option('vox', 0, 1), pieces: ['Master vox', 'Hot-shot laspistol'] },
      ],
      4,
    ),
    key: 'scions',
  }
  const model: LoadoutModel = {
    name: 'Tempestus Scion',
    fixed: [],
    members: [
      { id: 'standard', choiceKey: 'scions', baseCount: 0 },
      { id: 'vox', choiceKey: 'scions', baseCount: 0 },
    ],
    rows: [
      { name: 'Regimental standard and Hot-shot lasgun', choiceKey: 'scions', optionId: 'standard' },
      { name: 'Master vox and Hot-shot laspistol', choiceKey: 'scions', optionId: 'vox' },
    ],
  }

  it('takes the body from the default model of the group', () => {
    expect(poolHandlers(model, [scions], []).spend(model.rows[0]!)).toEqual([['scions', { standard: 1, scion: 3 }]])
  })
})

describe('a weapon that brings its model into the squad', () => {
  type Counts = Record<string, number>
  const held = (group: LoadoutChoice) => group.options.reduce((total, entry) => total + entry.count, 0)
  const armed = (id: string, count: number, max: number, pieces: string[], isDefault = false) => ({
    ...option(id, count, max),
    pieces,
    ...(isDefault ? { default: true } : {}),
  })
  const countsOf = (group: LoadoutChoice) => Object.fromEntries(group.options.map((entry) => [entry.id, entry.count]))
  /** The counts every group holds once a press is saved, which is what the next press reads. */
  const saved = (choices: readonly LoadoutChoice[], change: ReturnType<ReturnType<typeof poolHandlers>['spend']>) =>
    choices.map((group) => {
      const counts: Counts | undefined = change?.find(([key]) => key === group.key)?.[1]
      return counts
        ? {
            ...group,
            options: group.options.map((entry) => (Object.hasOwn(counts, entry.id) ? { ...entry, count: counts[entry.id]! } : entry)),
          }
        : group
    })

  describe('a scout squad arming the carrier its heavy weapon needs', () => {
    const squad: LoadoutChoice = {
      ...choice(
        [
          armed('boltgun', 4, 4, ['Boltgun'], true),
          armed('shotgun', 0, 4, ['Astartes Shotgun']),
          armed('knife', 0, 4, ['Combat Knife']),
          armed('heavy', 0, 1, ['Heavy Bolter']),
          armed('sniper', 0, 1, ['Scout Sniper Rifle']),
        ],
        4,
      ),
      key: 'scouts',
    }
    const heavyWeapon: LoadoutChoice = {
      ...choice([option('bolter', 0, 1), option('missile', 0, 1)], 1),
      key: 'scouts/heavy/weapon',
      carried: true,
      owner: { id: 'heavy', name: 'Scout w/ Heavy Weapon', profile: null },
    }
    const row = (name: string, choiceKey: string, optionId: string) => ({ name, choiceKey, optionId })
    const model: LoadoutModel = {
      name: 'Scout Squad',
      fixed: [],
      members: squad.options.map((entry) => ({ id: entry.id, choiceKey: 'scouts', baseCount: 0 })),
      rows: [
        row('Boltgun', 'scouts', 'boltgun'),
        row('Astartes Shotgun', 'scouts', 'shotgun'),
        row('Combat Knife', 'scouts', 'knife'),
        row('Heavy Bolter', heavyWeapon.key, 'bolter'),
        row('Missile Launcher', heavyWeapon.key, 'missile'),
        row('Scout Sniper Rifle', 'scouts', 'sniper'),
      ],
    }
    const weapons = [
      weapon('Boltgun', 'Ranged Weapons'),
      weapon('Astartes Shotgun', 'Ranged Weapons'),
      weapon('Combat Knife', 'Melee Weapons'),
      weapon('Heavy Bolter', 'Ranged Weapons'),
      weapon('Missile Launcher', 'Ranged Weapons'),
      weapon('Scout Sniper Rifle', 'Ranged Weapons'),
    ]
    const press = (choices: readonly LoadoutChoice[], name: string, action: 'spend' | 'free') =>
      saved(choices, poolHandlers(model, choices, weapons)[action](model.rows.find((candidate) => candidate.name === name)!))
    const armedSquad = ['Combat Knife', 'Combat Knife', 'Scout Sniper Rifle', 'Missile Launcher'].reduce(
      (choices, name) => press(choices, name, 'spend'),
      [squad, heavyWeapon],
    )

    it('saves the carrier in place of a default scout', () => {
      expect(countsOf(armedSquad[0]!)).toEqual({ boltgun: 0, shotgun: 0, knife: 2, heavy: 1, sniper: 1 })
    })

    it('takes a later weapon from a squadmate the build still holds', () => {
      expect(countsOf(press(armedSquad, 'Astartes Shotgun', 'spend')[0]!)).toEqual({
        boltgun: 0,
        shotgun: 1,
        knife: 1,
        heavy: 1,
        sniper: 1,
      })
    })

    it('sends the carrier away with his weapon and returns a default scout', () => {
      const putDown = press(armedSquad, 'Missile Launcher', 'free')
      expect(putDown.map(countsOf)).toEqual([
        { boltgun: 1, shotgun: 0, knife: 2, heavy: 0, sniper: 1 },
        { bolter: 0, missile: 0 },
      ])
    })
  })

  describe('a plague marine squad adding specialists filed under its own group', () => {
    const size = 4
    const marines: LoadoutChoice = {
      ...choice(
        [armed('boltgun', size, size, ['Plague knives', 'Boltgun'], true), armed('spewer', 0, 1, ['Plague spewer', 'Plague knives'])],
        size,
      ),
      key: 'marines',
    }
    const special: LoadoutChoice = {
      ...choice([armed('melta', 0, 2, ['Plague knives', 'Meltagun']), armed('plasma', 0, 2, ['Plasma gun', 'Plague knives'])], 2, true),
      key: 'marines/special',
    }
    const model: LoadoutModel = {
      name: 'Plague Marine',
      fixed: [],
      members: [...marines.options, ...special.options].map((entry) => ({
        id: entry.id,
        choiceKey: marines.options.includes(entry) ? 'marines' : 'marines/special',
        baseCount: 0,
      })),
      rows: [
        { name: 'Boltgun', choiceKey: 'marines', optionId: 'boltgun' },
        { name: 'Plague spewer', choiceKey: 'marines', optionId: 'spewer' },
        { name: 'Meltagun', choiceKey: 'marines/special', optionId: 'melta' },
        { name: 'Plasma gun', choiceKey: 'marines/special', optionId: 'plasma' },
      ],
    }
    // The squad's group offers, and caps its default at, the room its nested specialists leave, as the build reports it.
    const press = (choices: readonly LoadoutChoice[], name: string, action: 'spend' | 'free') => {
      const [squad, specialists] = saved(choices, poolHandlers(model, choices, [])[action](model.rows.find((row) => row.name === name)!))
      const room = size - held(specialists!)
      return [{ ...squad!, room, options: squad!.options.map((entry) => (entry.default ? { ...entry, max: room } : entry)) }, specialists!]
    }
    const sequence = [
      ['Meltagun', 'spend'],
      ['Plasma gun', 'spend'],
      ['Plague spewer', 'spend'],
      ['Meltagun', 'free'],
      ['Plasma gun', 'free'],
    ] as const
    const steps: LoadoutChoice[][] = [[marines, special]]
    for (const [name, action] of sequence) steps.push(press(steps.at(-1)!, name, action))

    it.each(sequence.map(([name, action], at) => [`${action} ${name}`, at + 1] as const))('keeps the squad its size after %s', (_, at) => {
      expect(held(steps[at]![0]!) + held(steps[at]![1]!)).toBe(size)
    })

    it('takes a default marine for each specialist', () => {
      expect(countsOf(steps[2]![0]!)).toEqual({ boltgun: 2, spewer: 0 })
    })

    it('returns the body to the default loadout though its cap only grows once the specialist is gone', () => {
      const putDown = press(press([marines, special], 'Meltagun', 'spend'), 'Meltagun', 'free')
      expect(countsOf(putDown[0]!)).toEqual({ boltgun: size, spewer: 0 })
    })

    it('returns a default marine for each specialist put down', () => {
      expect(countsOf(steps[5]![0]!)).toEqual({ boltgun: 3, spewer: 1 })
    })
  })
})

it('keeps default and fixed wargear before alternatives even after they are replaced', () => {
  const model: LoadoutModel = {
    name: 'Trooper',
    members: [],
    fixed: [{ name: 'Combat knife', count: 0 }],
    rows: [
      { name: 'Plasma pistol', choiceKey: 'group', optionId: 'pistol' },
      { name: 'Bolt carbine', choiceKey: 'group', optionId: 'carbine' },
    ],
  }
  const choices = [
    choice(
      [
        { ...option('pistol', 1, 1), name: 'Plasma pistol' },
        { ...option('carbine', 0, 1), name: 'Bolt carbine', default: true },
      ],
      1,
    ),
  ]
  const weapons = [
    weapon('Plasma pistol', 'Ranged Weapons'),
    weapon('Bolt carbine', 'Ranged Weapons'),
    weapon('Combat knife', 'Melee Weapons'),
  ]
  expect(orderedModelWargear(model, choices, weapons).map((entry) => entry.name)).toEqual(['Bolt carbine', 'Combat knife', 'Plasma pistol'])
})

it.each([
  ['spend', 0, 1],
  ['free', 1, 0],
] as const)('%s changes only an optional nested weapon, leaving its parent and other weapon slots intact', (action, count, expected) => {
  const gun = { name: 'Gun', choiceKey: 'loadout/pair/guns', optionId: 'gun' }
  const model: LoadoutModel = {
    name: 'Leader',
    fixed: [],
    members: [{ id: 'leader', choiceKey: null, baseCount: 1 }],
    rows: [
      { name: 'Blade and Gun', pieces: ['Blade', 'Gun'], choiceKey: 'loadout', optionId: 'pair' },
      { name: 'Blade', choiceKey: 'loadout/pair/blades', optionId: 'blade' },
      gun,
    ],
  }
  const choices = [
    { ...choice([{ ...option('pair', 1, 2), default: true }], 2), key: 'loadout' },
    { ...choice([{ ...option('blade', 0, 2), default: true }], 2), key: 'loadout/pair/blades' },
    { ...choice([{ ...option('gun', count, 2), default: true }], 2, true), key: gun.choiceKey },
  ]
  expect(poolHandlers(model, choices, [weapon('Gun', 'Ranged Weapons'), weapon('Blade', 'Melee Weapons')])[action](gun)).toEqual([
    [gun.choiceKey, { gun: expected }],
  ])
})

it.each([true, false])('cannot empty a required weapon slot with default=%s', (isDefault) => {
  const row = { name: 'Blade', choiceKey: 'weapons', optionId: 'blade' }
  const model: LoadoutModel = { name: 'Leader', fixed: [], members: [{ id: 'leader', choiceKey: null, baseCount: 1 }], rows: [row] }
  const group = { ...choice([{ ...option('blade', 1, 2), default: isDefault }], 2), key: row.choiceKey }
  expect(poolHandlers(model, [group], []).free(row)).toBeNull()
})

it('returns a required replacement to the default weapon without emptying the slot', () => {
  const rows = [
    { name: 'Blade', choiceKey: 'weapons', optionId: 'blade' },
    { name: 'Axe', choiceKey: 'weapons', optionId: 'axe' },
  ]
  const model: LoadoutModel = { name: 'Leader', fixed: [], members: [{ id: 'leader', choiceKey: null, baseCount: 1 }], rows }
  const group = { ...choice([{ ...option('blade', 0, 2), default: true }, option('axe', 1, 2)], 2), key: 'weapons' }
  expect(poolHandlers(model, [group], []).free(rows[1]!)).toEqual([['weapons', { axe: 0, blade: 1 }]])
})

it.each([
  [1, 'free'],
  [2, 'free'],
  [1, 'spend'],
  [2, 'spend'],
  [0, 'restore'],
  [1, 'restore'],
] as const)('updating %s specialists through %s keeps sibling weapon allocations in step', (specialists, action) => {
  const rows = [
    { name: 'Rifle and Knife', pieces: ['Rifle', 'Knife'], choiceKey: 'models', optionId: 'regular' },
    { name: 'Cannon', choiceKey: 'models/specialist/ranged', optionId: 'cannon' },
    { name: 'Blade', choiceKey: 'models/specialist/melee', optionId: 'blade' },
  ]
  const model: LoadoutModel = {
    name: 'Trooper',
    fixed: [],
    rows,
    members: ['regular', 'specialist'].map((id) => ({ id, choiceKey: 'models', baseCount: 0 })),
  }
  const owner = { id: 'specialist', name: 'Specialist', profile: null }
  const choices = [
    { ...choice([{ ...option('regular', 4 - specialists, 4), default: true }, option('specialist', specialists, 2)], 4), key: 'models' },
    { ...choice([option('cannon', specialists, 2)], 2), key: rows[1]!.choiceKey, owner, carried: true },
    { ...choice([{ ...option('blade', specialists, 2), default: true }], 2), key: rows[2]!.choiceKey, owner, carried: true },
    { ...choice([option('scope', Math.max(0, specialists - 1), 2)], 2, true), key: 'models/specialist/extras', owner, carried: true },
  ]
  expect(
    poolHandlers(model, choices, [weapon('Rifle', 'Ranged Weapons'), weapon('Cannon', 'Ranged Weapons'), weapon('Blade', 'Melee Weapons')])[
      action === 'restore' ? 'spend' : action
    ](rows[action === 'spend' ? 0 : 1]!),
  ).toEqual(
    action === 'restore'
      ? [
          ['models', { regular: 3 - specialists, specialist: specialists + 1 }],
          ['models/specialist/ranged', { cannon: specialists + 1 }],
          ['models/specialist/melee', { blade: specialists + 1 }],
        ]
      : [
          ['models/specialist/ranged', { cannon: specialists - 1 }],
          ['models', { regular: 5 - specialists, specialist: specialists - 1 }],
          ['models/specialist/melee', { blade: specialists - 1 }],
        ],
  )
})

it('matches a weapon within a bundle by its existing profile name', () => {
  expect(
    weaponProfilesFor({ name: 'Kroot rifle', pieces: ['Kroot rifle'] }, [
      { ...weapon('Kroot rifle (Ranged)', 'Ranged Weapons'), equipmentName: 'Kroot bolt thrower and Kroot rifle' },
      { ...weapon('Kroot bolt thrower', 'Ranged Weapons'), equipmentName: 'Kroot bolt thrower and Kroot rifle' },
    ]).map((profile) => profile.name),
  ).toEqual(['Kroot rifle (Ranged)'])
})

describe('why one more of an option cannot be added', () => {
  it("names the option's own cap", () => {
    const group = choice([option('blaster', 8, 10), option('special', 2, 2)], 10)
    expect(increaseBlocked(group, group.options[1]!)).toBe('Max 2')
  })

  it('names a group with no room left', () => {
    const group = choice([option('heavy', 1, 1), option('special', 2, 2), option('plasma', 0, 1)], 3)
    expect(increaseBlocked(group, group.options[2]!)).toBe('Group full: 3/3')
  })

  it('names nothing while the option and its group both have room', () => {
    const group = choice([option('blaster', 1, 3), option('carbine', 0, 3)], 3)
    expect(increaseBlocked(group, group.options[1]!)).toBeNull()
  })
})
