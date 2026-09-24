import { describe, expect, it } from 'vitest'
import type { KeyedPick } from '../../../rosterPicks'
import { pickEditor } from './usePicks'

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
