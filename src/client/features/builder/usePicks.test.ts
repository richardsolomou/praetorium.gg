import { describe, expect, it } from 'vitest'
import type { KeyedPick } from '../../rosterPicks'
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
