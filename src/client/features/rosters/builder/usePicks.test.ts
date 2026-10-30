import { describe, expect, it } from 'vitest'
import type { KeyedPick } from '../rosterPicks'
import { pickEditor, requestedUnit, settledWarlord } from './usePicks'

/** The group a model's heavy weapon is chosen from, and a choice nested under it. */
const group = 'members/heavy-terminator/heavy-weapon'
const nested = `${group}/launcher/ammunition`

type Edit = ReturnType<typeof pickEditor>

/** An editor over a list, and what its edits leave the list holding. */
function editor(initial: KeyedPick[], context: Parameters<typeof pickEditor>[1], nextKey: () => number = () => 1) {
  let picks = initial
  const edit = pickEditor((update) => (picks = typeof update === 'function' ? update(picks) : update), context, nextKey)
  return { edit, picks: () => picks }
}

/** What one edit leaves the list holding. */
function edited(spreads: Record<string, Record<string, number>>, run: (edit: Edit) => void) {
  const { edit, picks } = editor([{ key: 0, entryId: 'squad', catalogueId: 'imperium', spreads }], { catalogueId: 'imperium', units: [] })
  run(edit)
  return picks()[0]
}

function harness(models = 3) {
  const { edit, picks } = editor([{ key: 0, entryId: 'squad', catalogueId: 'imperium' }], {
    catalogueId: 'imperium',
    units: [
      {
        size: { models, min: 1, max: 6 },
        toggles: [],
        choices: [
          {
            key: 'weapons',
            options: [
              { id: 'blaster', count: 3 },
              { id: 'carbine', count: 0 },
            ],
          },
        ],
      },
    ],
  })
  return { edit, pick: () => picks()[0] }
}

describe('consecutive counter presses', () => {
  it('resizes from the current equipment and removes remembered inactive compositions', () => {
    const { edit, picks } = editor(
      [
        {
          key: 0,
          entryId: 'squad',
          models: 3,
          choices: { composition: 'three', banner: 'vexilla' },
          spreads: {
            'composition/two/weapons': { spear: 0, axe: 2 },
            'composition/three/weapons': { spear: 1, axe: 2 },
            banner: { vexilla: 1 },
          },
        },
      ],
      {
        catalogueId: 'cat',
        units: [
          {
            size: { models: 3, min: 2, max: 3, options: [2, 3] },
            toggles: [],
            choices: [
              {
                key: 'composition',
                name: 'Unit Composition',
                options: [
                  { id: 'two', count: 0 },
                  { id: 'three', count: 1 },
                ],
              },
              {
                key: 'composition/three/weapons',
                options: [
                  { id: 'spear', count: 1 },
                  { id: 'axe', count: 2 },
                ],
              },
            ],
          },
        ],
      },
    )
    edit.resize(0, () => 2)
    expect(picks()[0]).toMatchObject({
      models: 2,
      choices: { banner: 'vexilla' },
      spreads: { 'composition/three/weapons': { spear: 1, axe: 2 }, banner: { vexilla: 1 } },
    })
    expect(picks()[0]?.spreads).not.toHaveProperty('composition/two/weapons')
    expect(picks()[0]?.choices).not.toHaveProperty('composition')
  })
  it('saves the shown counts a press leaves alone when the group has no saved spread yet', () => {
    const { edit, pick } = harness()
    edit.spread(0, 'weapons', (counts) => ({ carbine: (counts.carbine ?? 0) + 1 }))
    expect(pick()?.spreads?.weapons).toEqual({ blaster: 3, carbine: 1 })
  })

  it('applies each spread press to the counts the pick already holds', () => {
    const { edit, pick } = harness()
    const moveToCarbine = (counts: Record<string, number>) => ({
      blaster: (counts.blaster ?? 0) - 1,
      carbine: (counts.carbine ?? 0) + 1,
    })

    edit.spread(0, 'weapons', moveToCarbine)
    edit.spread(0, 'weapons', moveToCarbine)

    expect(pick()?.spreads?.weapons).toEqual({ blaster: 1, carbine: 2 })
  })

  it('applies each size press to the model count the pick already holds', () => {
    const { edit, pick } = harness()

    edit.resize(0, (models) => models + 1)
    edit.resize(0, (models) => models + 1)

    expect(pick()?.models).toBe(5)
    edit.resize(0, (models) => models + 10)
    expect(pick()?.models).toBe(6)
  })

  it('leaves the pick unchanged when a spread press cannot act', () => {
    const { edit, pick } = harness()

    edit.spread(0, 'weapons', () => null)

    expect(pick()?.spreads).toBeUndefined()
  })
})

describe('resizing a squad with saved model counts', () => {
  type Unit = NonNullable<Parameters<typeof pickEditor>[1]['units'][number]>
  const member = (choiceKey: string) => ({ choiceKey })
  const resized = (unit: Unit, spreads: KeyedPick['spreads'], step: (models: number) => number, presses = 1) => {
    const { edit, picks } = editor([{ key: 0, entryId: 'squad', catalogueId: 'cat', models: unit.size.models, spreads }], {
      catalogueId: 'cat',
      units: [unit],
    })
    for (let press = 0; press < presses; press++) edit.resize(0, step)
    return picks()[0]
  }
  const eradicators: Unit = {
    size: { models: 3, min: 3, max: 6 },
    toggles: [],
    choices: [
      {
        key: 'eradicators',
        options: [
          { id: 'rifle', count: 1, default: true },
          { id: 'multi', count: 1 },
        ],
      },
    ],
    models: [{ members: [member('eradicators'), member('eradicators')] }],
  }
  const marines: Unit = {
    size: { models: 10, min: 5, max: 10 },
    toggles: [],
    choices: [
      {
        key: 'marines',
        options: [
          { id: 'bubotic', count: 4 },
          { id: 'heavy', count: 1 },
          { id: 'boltgun', count: 2, default: true },
          { id: 'spewer', count: 1 },
        ],
      },
      { key: 'marines/special', optional: true, options: [{ id: 'melta', count: 1 }] },
    ],
    models: [{ members: [member('marines'), member('marines/special')] }],
  }
  const saved = (unit: Unit) =>
    Object.fromEntries(
      unit.choices.map((choice) => [choice.key, Object.fromEntries(choice.options.map((option) => [option.id, option.count]))]),
    )

  it('grows the saved counts into the default loadout', () => {
    expect(resized(eradicators, saved(eradicators), () => 6)?.spreads?.eradicators).toEqual({ rifle: 4, multi: 1 })
  })

  it('folds consecutive size presses against the counts the unit was built with', () => {
    expect(resized(eradicators, saved(eradicators), (models) => models + 1, 3)?.spreads?.eradicators).toEqual({ rifle: 4, multi: 1 })
  })

  it('rebases saved counts that disagree with the build on what the build shows', () => {
    expect(resized(eradicators, { eradicators: { rifle: 0, multi: 1 } }, () => 4)?.spreads?.eradicators).toEqual({ rifle: 2, multi: 1 })
  })

  it('shrinks out of the default loadout before the player’s picks', () => {
    expect(resized(marines, saved(marines), () => 8)?.spreads?.marines).toEqual({ bubotic: 4, heavy: 1, boltgun: 0, spewer: 1 })
  })

  it('shrinks the largest remaining loadout once the default is gone', () => {
    expect(resized(marines, saved(marines), () => 5)?.spreads?.marines).toEqual({ bubotic: 1, heavy: 1, boltgun: 0, spewer: 1 })
  })

  it('keeps specialists filed under the squad while it can shrink without them', () => {
    expect(resized(marines, saved(marines), () => 5)?.spreads?.['marines/special']).toEqual({ melta: 1 })
  })

  it('removes specialists filed under the squad once nothing else is left', () => {
    const crowded: Unit = {
      ...marines,
      size: { models: 3, min: 1, max: 10 },
      choices: [
        { key: 'marines', options: [{ id: 'boltgun', count: 1, default: true }] },
        { key: 'marines/special', optional: true, options: [{ id: 'melta', count: 1 }] },
      ],
    }
    expect(resized(crowded, saved(crowded), () => 1)?.spreads).toEqual({ marines: { boltgun: 0 }, 'marines/special': { melta: 0 } })
  })

  it('leaves a squad without saved counts to the build', () => {
    expect(resized(eradicators, undefined, () => 6)?.spreads).toBeUndefined()
  })
})

describe('datasheet roster caps', () => {
  const editWithLimit = (limit: number | null, initial: number) => {
    let nextKey = initial
    const { edit, picks } = editor(
      Array.from({ length: initial }, (_, key) => ({ key, entryId: 'squad', catalogueId: 'imperium' })),
      { catalogueId: 'imperium', units: [], limits: new Map([['squad', limit]]) },
      () => nextKey++,
    )
    return { edit, count: () => picks().length }
  }

  it('adds the first and final allowed copies', () => {
    const { edit, count } = editWithLimit(2, 0)
    edit.add('squad')
    edit.add('squad')
    expect(count()).toBe(2)
  })

  it('rejects an add and duplicate at the cap', () => {
    const { edit, count } = editWithLimit(2, 2)
    edit.add('squad')
    edit.duplicate(0)
    expect(count()).toBe(2)
  })

  it('allows an uncapped datasheet', () => {
    const { edit, count } = editWithLimit(null, 2)
    edit.duplicate(0)
    expect(count()).toBe(3)
  })

  it('rejects a saved loadout at the cap', () => {
    const { edit, count } = editWithLimit(2, 2)
    edit.apply([{ entryId: 'squad', catalogueId: 'imperium' }])
    expect(count()).toBe(2)
  })
})

describe('applying a saved loadout', () => {
  const applied = (
    loadout: Parameters<ReturnType<typeof pickEditor>['apply']>[0],
    limits: ReadonlyMap<string, number | null> = new Map([['squad', null]]),
  ) => {
    let next = 1
    const { edit, picks } = editor(
      [{ key: 0, entryId: 'captain', catalogueId: 'imperium' }],
      { catalogueId: 'imperium', units: [], limits },
      () => next++,
    )
    edit.apply(loadout)
    return picks().slice(1)
  }
  const attached = [
    { entryId: 'squad', catalogueId: 'imperium' },
    { entryId: 'lieutenant', catalogueId: 'imperium', attachedTo: 0 },
    { entryId: 'ancient', catalogueId: 'imperium', attachedTo: 1 },
  ]
  const unlimited = new Map<string, number | null>([
    ['squad', null],
    ['lieutenant', null],
    ['ancient', null],
  ])

  it('adds the configured unit with its wargear', () => {
    expect(applied([{ entryId: 'squad', catalogueId: 'imperium', models: 10, choices: { weapon: 'plasma' } }])[0]).toEqual({
      key: 1,
      entryId: 'squad',
      catalogueId: 'imperium',
      models: 10,
      choices: { weapon: 'plasma' },
      attachedTo: undefined,
    })
  })

  it('keeps the saved nickname', () => {
    expect(applied([{ entryId: 'squad', catalogueId: 'imperium', nickname: 'Tesla Wall' }])[0]?.nickname).toBe('Tesla Wall')
  })

  it('never joins its own unit to the unit at the saved attachment position', () => {
    expect(applied([{ entryId: 'squad', catalogueId: 'imperium', attachedTo: 0 }])[0]?.attachedTo).toBeUndefined()
  })

  it('joins each attached unit to the new unit it was saved against', () => {
    expect(applied(attached, unlimited).map((pick) => pick.attachedTo)).toEqual([undefined, 1, 2])
  })

  it('adds nothing of a group when one of its units is at its cap', () => {
    expect(applied(attached, new Map([...unlimited, ['ancient', 0]]))).toEqual([])
  })
})

/**
 * The same group can be answered as one chosen option or as a spread of counts, and
 * only one of those is a choice. Clearing the choice alone left the count behind,
 * which put the option straight back: the button emptied the group and the group
 * refilled itself, so nothing on screen moved.
 */
describe('clearing a choice', () => {
  it('empties the counts recorded for that group, not only the chosen option', () => {
    expect(edited({ [group]: { launcher: 1 } }, (edit) => edit.choose(0, group, ''))?.spreads).toEqual({})
  })

  it('empties what was recorded under the group’s own options', () => {
    expect(edited({ [group]: { launcher: 1 }, [nested]: { krak: 1 } }, (edit) => edit.choose(0, group, ''))?.spreads).toEqual({})
  })

  it('leaves another group alone', () => {
    const spreads = { [group]: { launcher: 1 }, members: { terminator: 4 } }

    expect(edited(spreads, (edit) => edit.choose(0, group, ''))?.spreads).toEqual({ members: { terminator: 4 } })
  })
})

/** Spreads apply after choices, so a group saved both ways silently ignored the option chosen. */
describe('answering a group one way', () => {
  it('drops the group’s counts when an option is chosen', () => {
    expect(edited({ [group]: { launcher: 2, cannon: 0 } }, (edit) => edit.choose(0, group, 'cannon'))?.spreads).toEqual({})
  })

  it('keeps the selections remembered under the group’s options when an option is chosen', () => {
    const spreads = { [group]: { launcher: 1 }, [nested]: { krak: 1 } }

    expect(edited(spreads, (edit) => edit.choose(0, group, 'launcher'))?.spreads).toEqual({ [nested]: { krak: 1 } })
  })

  it('drops the chosen option when the group is counted instead', () => {
    const { edit, pick } = harness()
    edit.choose(0, 'weapons', 'blaster')
    edit.spread(0, 'weapons', () => ({ blaster: 2, carbine: 1 }))
    expect(pick()?.choices).toEqual({})
  })

  it('keeps choices for other groups when a group is counted', () => {
    const { edit, pick } = harness()
    edit.choose(0, 'banner', 'vexilla')
    edit.spread(0, 'weapons', () => ({ blaster: 2, carbine: 1 }))
    expect(pick()?.choices).toEqual({ banner: 'vexilla' })
  })
})

describe('a unit a reference page asks the builder to add', () => {
  const limits = new Map<string, number | null>([
    ['squad', 3],
    ['tank', null],
  ])

  it('waits until the roster has its limits', () => {
    expect(requestedUnit('squad', 0, null)).toEqual({ kind: 'pending' })
  })

  it('is added while the roster has room for another copy', () => {
    expect(requestedUnit('squad', 2, limits)).toEqual({ kind: 'add' })
  })

  it('is added when nothing limits its copies', () => {
    expect(requestedUnit('tank', 9, limits)).toEqual({ kind: 'add' })
  })

  it('is refused with the picker’s reason when the roster holds its limit', () => {
    expect(requestedUnit('squad', 3, limits)).toEqual({
      kind: 'refused',
      reason: 'limit',
      message: 'Limit reached: 3 of 3 permitted copies in the roster.',
    })
  })

  it('is refused when the roster’s book does not offer it', () => {
    expect(requestedUnit('stranger', 0, limits)).toMatchObject({ kind: 'refused', reason: 'not_offered' })
  })
})

it('explains a requested unit blocked by current construction prerequisites', () => {
  const limits = new Map([['ally', 0]])
  expect(requestedUnit('ally', 0, limits)).toEqual({
    kind: 'refused',
    reason: 'limit',
    message: 'No copies available with the current detachments and prerequisite units.',
  })
})

describe('unit nicknames and notes', () => {
  function annotated(run: (edit: Edit) => void) {
    const { edit, picks } = editor([{ key: 0, entryId: 'squad', catalogueId: 'imperium', nickname: 'Alpha', note: 'Hold home.' }], {
      catalogueId: 'imperium',
      units: [],
      limits: new Map([['squad', null]]),
    })
    run(edit)
    return picks()
  }

  it('renames one unit', () => {
    expect(annotated((edit) => edit.annotate(0, 'nickname', 'Bravo'))[0]?.nickname).toBe('Bravo')
  })

  it('removes a note the player emptied', () => {
    expect(annotated((edit) => edit.annotate(0, 'note', '  '))[0]).not.toHaveProperty('note')
  })

  it('duplicates a unit without its nickname or note', () => {
    expect(annotated((edit) => edit.duplicate(0))[1]).toEqual({ key: 1, entryId: 'squad', catalogueId: 'imperium' })
  })
})

describe('starting embarks', () => {
  function embarked(run: (edit: Edit) => void, start: Partial<KeyedPick>[] = [{}, {}, {}]) {
    const { edit, picks } = editor(
      [
        { key: 10, entryId: 'squad', catalogueId: 'imperium', ...start[0] },
        { key: 11, entryId: 'captain', catalogueId: 'imperium', ...start[1] },
        { key: 12, entryId: 'rhino', catalogueId: 'imperium', ...start[2] },
      ],
      { catalogueId: 'imperium', units: [], limits: new Map([['squad', null]]) },
      () => 13,
    )
    run(edit)
    return picks()
  }

  it('starts a unit in a transport', () => {
    expect(embarked((edit) => edit.embark(10, 12))[0]?.embarkedIn).toBe(12)
  })

  it('puts a unit back on the battlefield', () => {
    expect(embarked((edit) => edit.embark(10, undefined), [{ embarkedIn: 12 }])[0]).not.toHaveProperty('embarkedIn')
  })

  it('leaves passengers on the battlefield when their transport is removed', () => {
    expect(embarked((edit) => edit.drop(2), [{ embarkedIn: 12 }])[0]).not.toHaveProperty('embarkedIn')
  })

  it('clears several starting embarks at once', () => {
    const picks = embarked((edit) => edit.disembark([10, 11]), [{ embarkedIn: 12 }, { embarkedIn: 12 }])
    expect(picks.map((pick) => pick.embarkedIn)).toEqual([undefined, undefined, undefined])
  })

  it('duplicates a unit without its starting embark', () => {
    expect(embarked((edit) => edit.duplicate(0), [{ embarkedIn: 12 }])[1]).not.toHaveProperty('embarkedIn')
  })

  it('leaves a character’s starting embark to the unit it joins', () => {
    expect(embarked((edit) => edit.join(1, 10), [{}, { embarkedIn: 12 }])[1]).not.toHaveProperty('embarkedIn')
  })

  it('leaves a starting embark to the unit a newly added character joins', () => {
    expect(embarked((edit) => edit.add('squad', { joinedBy: 11 }), [{}, { embarkedIn: 12 }])[1]).not.toHaveProperty('embarkedIn')
  })
})

describe('adding a unit to attach', () => {
  function added(limits: Map<string, number | null>, run: (edit: Edit) => void) {
    const { edit, picks } = editor(
      [
        { key: 0, entryId: 'squad', catalogueId: 'cat' },
        { key: 1, entryId: 'captain', catalogueId: 'cat' },
      ],
      { catalogueId: 'cat', units: [], limits },
      () => 2,
    )
    run(edit)
    return picks()
  }
  const open = new Map<string, number | null>([
    ['captain', null],
    ['squad', null],
  ])

  it('adds a new leader already joined to the chosen unit', () => {
    expect(added(open, (edit) => edit.add('captain', { joins: 0 })).at(-1)).toEqual({
      key: 2,
      entryId: 'captain',
      catalogueId: 'cat',
      attachedTo: 0,
    })
  })

  it('joins the chosen character to a newly added bodyguard', () => {
    expect(added(open, (edit) => edit.add('squad', { joinedBy: 1 }))[1]?.attachedTo).toBe(2)
  })

  it('adds nothing when the copy limit is reached', () => {
    expect(added(new Map([['captain', 1]]), (edit) => edit.add('captain', { joins: 0 }))).toHaveLength(2)
  })

  it('adds nothing when the chosen unit has left the roster', () => {
    expect(added(open, (edit) => edit.add('captain', { joins: 9 }))).toHaveLength(2)
  })
})

describe('the one Warlord', () => {
  const character = (selected = false, required = false) => ({
    toggles: [{ key: 'warlord', name: 'Warlord', selected, ...(required ? { required } : {}) }],
  })
  const squad = { toggles: [] }
  const picks = (...keys: number[]) => keys.map((key) => ({ key, entryId: `unit-${key}` }))

  it('is the eligible unit added first, wherever it sits in the list', () => {
    expect(settledWarlord(picks(4, 2, 7), [character(), squad, character()], true)).toEqual({ index: 0, toggle: 'warlord' })
    expect(settledWarlord(picks(4, 1, 7), [character(), character(), squad], true)).toEqual({ index: 1, toggle: 'warlord' })
  })

  it('is not chosen while the list already has one', () => {
    expect(settledWarlord(picks(0, 1), [character(), character(true)], true)).toBeNull()
  })

  it('is not chosen when no unit can be Warlord', () => {
    expect(settledWarlord(picks(0, 1), [squad, squad], true)).toBeNull()
  })

  it('stays away once the player removes it', () => {
    expect(settledWarlord(picks(0, 1), [character(), character()], false)).toBeNull()
  })

  it('goes to a unit that must be Warlord, from the one already crowned', () => {
    expect(settledWarlord(picks(0, 1), [character(true), character(true, true)], false)).toEqual({ index: 1, toggle: 'warlord' })
  })

  it('stays with a unit that must be Warlord when another claims it', () => {
    expect(settledWarlord(picks(0, 1), [character(false, true), character(true)], false)).toEqual({ index: 0, toggle: 'warlord' })
  })

  it('keeps the first of two crowns', () => {
    expect(settledWarlord(picks(3, 1), [character(true), character(true)], false)).toEqual({ index: 1, toggle: 'warlord' })
  })
})
