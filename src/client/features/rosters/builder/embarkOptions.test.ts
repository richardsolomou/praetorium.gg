import { describe, expect, it } from 'vitest'
import type { KeyedPick } from '../rosterPicks'
import { embarkOptions } from './embarkOptions'

const picks: KeyedPick[] = [
  { key: 10, entryId: 'squad' },
  { key: 11, entryId: 'rhino' },
  { key: 12, entryId: 'rhino', nickname: 'Steel' },
  { key: 13, entryId: 'captain', attachedTo: 10 },
  { key: 14, entryId: 'razorback' },
]
const units = [
  { name: 'Intercessors', group: 'battleline' as const },
  { name: 'Rhino', group: 'transport' as const, transport: true },
  { name: 'Rhino', group: 'transport' as const, transport: true },
  { name: 'Captain', group: 'character' as const },
  { name: 'Razorback', group: 'vehicle' as const, transport: true },
]

describe('embarkOptions', () => {
  it('lists every transport in the roster by a name that tells copies apart', () => {
    expect(embarkOptions(picks, units, 0)).toEqual([
      { key: 11, label: 'Rhino #1' },
      { key: 12, label: 'Steel · Rhino' },
      { key: 14, label: 'Razorback' },
    ])
  })

  it('offers nothing to a joined character or to a transport', () => {
    expect(embarkOptions(picks, units, 3)).toEqual([])
    expect(embarkOptions(picks, units, 1)).toEqual([])
  })
})
