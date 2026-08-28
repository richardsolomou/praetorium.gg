import { describe, expect, it } from 'vitest'
import { bookOf, withCards } from './catalogue.fixtures'
import { detachmentNamed, factionsFor, isReferenceDetachment } from './factionReferences'
import type { LoadedRules } from './rules'

describe('joining catalogue detachments to their rules reference', () => {
  it('tolerates a spacing-only name difference', () => {
    const haloscreed = { points: 3 }
    expect(detachmentNamed(new Map([['haloscreed-battle-clade', haloscreed]]), 'Haloscreed Battleclade')).toBe(haloscreed)
  })

  it('finds battle stratagem maps across the same compact-name difference', () => {
    const stratagems = [{ key: 'stratagem' }]
    expect(detachmentNamed(new Map([['haloscreed-battle-clade', stratagems]]), 'Haloscreed Battleclade')).toBe(stratagems)
  })

  it('keeps a reference when the catalogue compacts the Game Datacards name', () => {
    const loaded = bookOf({
      name: 'Adeptus Mechanicus',
      selectionEntries: [{ id: 'unit', name: 'Unit', type: 'unit' }],
      sharedSelectionEntries: [
        {
          id: 'wrapper',
          name: 'Detachment',
          type: 'upgrade',
          selectionEntryGroups: [
            {
              id: 'choices',
              name: 'Detachment',
              selectionEntries: [{ id: 'haloscreed', name: 'Haloscreed Battleclade', type: 'upgrade' }],
            },
          ],
        },
      ],
    })
    const content = withCards('Adeptus Mechanicus', [])
    content.detachments.add('Haloscreed Battle Clade')
    loaded.factionContents.set('adeptus-mechanicus', content)
    const faction = loaded.factions[0]!
    const detachment = loaded.detachments.get(faction.id)!.options[0]!

    expect(isReferenceDetachment(loaded, null, faction, detachment)).toBe(true)
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

  it('keeps a detachment with the faction that offers it when an imported parent only defines it', () => {
    const loaded = bookOf({
      name: 'Child',
      selectionEntries: [{ id: 'unit', name: 'Unit', type: 'unit' }],
      sharedSelectionEntries: [
        {
          id: 'wrapper',
          name: 'Detachment',
          type: 'upgrade',
          selectionEntryGroups: [
            {
              id: 'choices',
              name: 'Detachment',
              selectionEntries: [{ id: 'chapter-detachment', name: "Emperor's Shield", type: 'upgrade' }],
            },
          ],
        },
      ],
    })
    const faction = loaded.factions[0]!
    const detachment = loaded.detachments.get(faction.id)!.options[0]!
    const owner = { id: 'parent', name: 'Parent', references: [] }
    loaded.index.catalogueOf.set(detachment.id, owner.id)
    loaded.index.catalogues.set(owner.id, { id: owner.id, name: owner.name, gameSystem: false })
    loaded.factions.push(owner)
    loaded.detachments.set(owner.id, { ...loaded.detachments.get(faction.id)!, options: [] })
    const reference = { enhancements: 0, upgrades: 0, stratagems: 0, points: 2, dispositions: ['purge-the-foe'] }
    const rules = {
      factionKeys: new Map([
        ['child', 'child'],
        ['parent', 'parent'],
      ]),
      detachmentReferences: new Map([
        ['child', new Map([[detachment.name, reference]])],
        ['parent', new Map([[detachment.name, reference]])],
      ]),
    } as Partial<LoadedRules> as LoadedRules

    expect(isReferenceDetachment(loaded, rules, faction, detachment)).toBe(true)
  })
})
