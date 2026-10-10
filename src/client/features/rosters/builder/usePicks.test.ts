import { describe, expect, it } from 'vitest'
import type { KeyedPick } from '../rosterPicks'
import { pickEditor, requestedUnit } from './usePicks'

/** The group a model's heavy weapon is chosen from, and a choice nested under it. */
const group = 'members/heavy-terminator/heavy-weapon'
const nested = `${group}/launcher/ammunition`

/** What one edit leaves the list holding. */
function edited(spreads: Record<string, Record<string, number>>, run: (edit: ReturnType<typeof pickEditor>) => void) {
  let picks: KeyedPick[] = [{ key: 0, entryId: 'squad', catalogueId: 'imperium', spreads }]
  const edit = pickEditor(
    (update) => {
      picks = typeof update === 'function' ? update(picks) : update
    },
    { catalogueId: 'imperium', units: [] },
    () => 1,
  )
  run(edit)
  return picks[0]
}

function harness(models = 3) {
  let picks: KeyedPick[] = [{ key: 0, entryId: 'squad', catalogueId: 'imperium' }]
  const edit = pickEditor(
    (update) => {
      picks = typeof update === 'function' ? update(picks) : update
    },
    {
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
    },
    () => 1,
  )
  return { edit, pick: () => picks[0] }
}

describe('consecutive counter presses', () => {
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

describe('datasheet roster caps', () => {
  const editWithLimit = (limit: number | null, initial: number) => {
    let picks: KeyedPick[] = Array.from({ length: initial }, (_, key) => ({ key, entryId: 'squad', catalogueId: 'imperium' }))
    let nextKey = initial
    const edit = pickEditor(
      (update) => {
        picks = typeof update === 'function' ? update(picks) : update
      },
      { catalogueId: 'imperium', units: [], limits: new Map([['squad', limit]]) },
      () => nextKey++,
    )
    return { edit, count: () => picks.length }
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

  it('keeps the counts when a choice is made rather than cleared', () => {
    const spreads = { [group]: { launcher: 1 } }

    expect(edited(spreads, (edit) => edit.choose(0, group, 'launcher'))?.spreads).toEqual(spreads)
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
      message: 'Limit reached',
    })
  })

  it('is refused when the roster’s book does not offer it', () => {
    expect(requestedUnit('stranger', 0, limits)).toMatchObject({ kind: 'refused', reason: 'not_offered' })
  })
})
