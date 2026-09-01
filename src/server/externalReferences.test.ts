import { describe, expect, it } from 'vitest'
import { canonicalIdsFor, externalIdsFor, indexExternalReferences, relatedExternalIds } from './externalReferences'

const index = indexExternalReferences([
  {
    id: 'first',
    external_refs: [
      { namespace: 'bsdata', id: 'shared' },
      { namespace: 'game-datacards', id: 'card-one' },
    ],
  },
  {
    id: 'second',
    external_refs: [
      { namespace: 'bsdata', id: 'shared' },
      { namespace: 'game-datacards', id: 'card-two' },
    ],
  },
])

describe('external reference indexes', () => {
  it('returns every canonical record for a shared source identity', () => {
    expect(canonicalIdsFor(index, 'bsdata', 'shared')).toEqual(['first', 'second'])
  })

  it('returns every related identity across a many-to-many mapping', () => {
    expect(relatedExternalIds(index, 'bsdata', 'shared', 'game-datacards')).toEqual(['card-one', 'card-two'])
  })

  it('returns the identities carried by one canonical record', () => {
    expect(externalIdsFor(index, 'first', 'game-datacards')).toEqual(['card-one'])
  })

  it('keeps namespace and ID matching exact', () => {
    expect(relatedExternalIds(index, 'BSData', 'shared', 'game-datacards')).toEqual([])
  })
})
