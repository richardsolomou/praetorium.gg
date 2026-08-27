import { describe, expect, it } from 'vitest'
import type { KeyedPick } from '../../rosterPicks'
import { pickEditor } from './usePicks'

/** A priced unit in the narrow shape the editor reads back off the list. */
const unit = (options: { id: string; count: number }[], models = 3) => ({
  size: { models, min: 1, max: 6 },
  toggles: [],
  choices: [{ key: 'g', options }],
})

function harness(initial: KeyedPick[], units: ReturnType<typeof unit>[]) {
  let picks = initial
  const edit = pickEditor(
    (update) => {
      picks = typeof update === 'function' ? update(picks) : update
    },
    { catalogueId: 'cat', units },
  )
  return { edit, picks: () => picks }
}

describe('spreading against the live counts', () => {
  // The screen still shows the priced answer; the list already holds the first press.
  const swapToCarbine = (counts: Record<string, number>) => ({
    carbine: (counts.carbine ?? 0) + 1,
    blaster: (counts.blaster ?? 0) - 1,
  })

  it('folds each press against the pick, so two before a price returns do not double-apply', () => {
    const { edit, picks } = harness(
      [{ entryId: 'tomb-blades', catalogueId: 'cat', key: 0 }],
      [
        unit([
          { id: 'blaster', count: 3 },
          { id: 'carbine', count: 0 },
        ]),
      ],
    )
    edit.spread(0, 'g', swapToCarbine)
    edit.spread(0, 'g', swapToCarbine)
    expect(picks()[0]?.spreads?.g).toEqual({ carbine: 2, blaster: 1 })
  })

  it('leaves the pick alone when the press cannot act', () => {
    const { edit, picks } = harness(
      [{ entryId: 'tomb-blades', catalogueId: 'cat', key: 0 }],
      [
        unit([
          { id: 'blaster', count: 3 },
          { id: 'carbine', count: 0 },
        ]),
      ],
    )
    edit.spread(0, 'g', () => null)
    expect(picks()[0]?.spreads).toBeUndefined()
  })
})

describe('resizing against the pick', () => {
  it('steps off the size the list holds, not the priced answer, and stays within bounds', () => {
    const { edit, picks } = harness([{ entryId: 'warriors', catalogueId: 'cat', key: 0 }], [unit([], 3)])
    edit.resize(0, (current) => current + 1)
    edit.resize(0, (current) => current + 1)
    expect(picks()[0]?.models).toBe(5)
    edit.resize(0, (current) => current + 10)
    expect(picks()[0]?.models).toBe(6)
  })
})
