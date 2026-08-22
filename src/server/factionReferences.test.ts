import { describe, expect, it } from 'vitest'
import { detachmentNamed } from './factionReferences'

describe('joining catalogue detachments to their rules reference', () => {
  it('tolerates a spacing-only name difference', () => {
    const haloscreed = { points: 3 }
    expect(detachmentNamed(new Map([['haloscreed-battle-clade', haloscreed]]), 'Haloscreed Battleclade')).toBe(haloscreed)
  })

  it('tolerates accents omitted by an upstream id', () => {
    const delve = { points: 2 }
    expect(detachmentNamed(new Map([['delve-assault-shift', delve]]), 'Dêlve Assault Shift')).toBe(delve)
  })

  it('does not guess between compact names that collide', () => {
    const detachments = new Map([
      ['battle-clade', { points: 3 }],
      ['battleclade', { points: 2 }],
    ])
    expect(detachmentNamed(detachments, 'Battle Clade')).toEqual({ points: 3 })
    expect(detachmentNamed(detachments, 'Battlecl ade')).toBeUndefined()
  })
})
