import { describe, expect, it } from 'vitest'
import type { TerrainLayout } from '../../../contracts/terrain'
import { battlefieldLayout } from './battlefieldLayout'

const layout: TerrainLayout = {
  id: '329d6325-40a7-4bbb-9bed-565556ff8a98',
  name: 'Take and Hold / Reconnaissance - Layout C',
  matchupId: 'take-and-hold-vs-reconnaissance',
  variant: 3,
  deploymentId: 'search-id',
  description: null,
  pieces: [],
  geometry: null,
}

describe('saved battlefield layout', () => {
  it('resolves a current ID', () => {
    expect(battlefieldLayout(layout.id, [layout])).toBe(layout)
  })

  it('resolves the older Battlemaster ID to the same matchup and variant', () => {
    expect(battlefieldLayout('bm-take-vs-recon-03', [layout])).toBe(layout)
  })

  it('accepts either matchup order', () => {
    expect(battlefieldLayout('bm-take-vs-recon-03', [{ ...layout, matchupId: 'reconnaissance-vs-take-and-hold' }])?.id).toBe(layout.id)
  })

  it.each(['bm-take-vs-recon-02', 'bm-take-vs-purge-03', 'missing-layout', null])('does not substitute another layout for %s', (id) => {
    expect(battlefieldLayout(id, [layout])).toBeNull()
  })

  it('leaves an ambiguous older layout unresolved', () => {
    expect(battlefieldLayout('bm-take-vs-recon-03', [layout, { ...layout, id: 'other-pack' }])).toBeNull()
  })
})
