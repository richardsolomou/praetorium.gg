import { describe, expect, it } from 'vitest'
import { bookOf } from './catalogue.fixtures'
import { detachmentNamed, factionsFor } from './factionReferences'
import type { LoadedRules } from './rules'

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

  it('does not publish a catalogue disposition when the rules reference is unknown', () => {
    const loaded = bookOf({
      name: 'Death Guard',
      selectionEntries: [{ id: 'plague-marine', name: 'Plague Marine', type: 'unit' }],
      sharedSelectionEntries: [
        {
          id: 'wrapper',
          name: 'Detachment',
          type: 'upgrade',
          selectionEntryGroups: [
            {
              id: 'choices',
              name: 'Detachment',
              selectionEntries: [
                {
                  id: 'flyblown-host',
                  name: 'Flyblown Host',
                  type: 'upgrade',
                  categoryLinks: [{ id: 'disruption', name: 'Disruption', targetId: 'disruption' }],
                },
              ],
            },
          ],
        },
      ],
    })
    const rules = {
      factionKeys: new Map([['death-guard', 'death-guard']]),
      factionNames: new Map(),
      factionIcons: new Map(),
      factionRules: new Map(),
      detachmentReferences: new Map([
        ['death-guard', new Map([['flyblown-host', { enhancements: 0, upgrades: 0, stratagems: 0, points: null, dispositions: [] }]])],
      ]),
      detachmentDetails: new Map(),
      dispositions: new Map(),
    } as Partial<LoadedRules> as LoadedRules

    expect(factionsFor(loaded, rules).factions[0]?.detachments[0]?.dispositions).toEqual([])
  })
})
