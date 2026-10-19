import { describe, expect, it } from 'vitest'
import { bookOf, withCards } from './catalogue.fixtures'
import { detachmentNamed, detachmentsOffering, factionsFor, isReferenceDetachment } from '../shared/factionReferences'
import type { LoadedRules } from './rules'

describe('joining catalogue detachments to their rules reference', () => {
  it('joins the verified singular BSData label to the plural Game Datacards label', () => {
    const reference = { points: 2 }
    expect(detachmentNamed(new Map([['brood-brothers-auxilia', reference]]), 'Brood Brother Auxilia')).toBe(reference)
  })

  it('does not infer aliases for other singular and plural detachment names', () => {
    expect(detachmentNamed(new Map([['plague-hosts', []]]), 'Plague Host')).toBeUndefined()
  })

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

  it.each([
    ['Gladius Task Force', 'Adeptus Astartes', true],
    ["Forgefather's Seekers", 'Salamanders', false],
  ])('uses declared ownership for %s in the parent reference', (name, owner, expected) => {
    const loaded = bookOf({ name: 'Space Marines', selectionEntries: [{ id: 'unit', name: 'Unit', type: 'unit' }] })
    const content = withCards('Adeptus Astartes', [])
    content.detachments.add(name)
    content.detachmentFactions = new Map([[name, owner]])
    loaded.factionContents.set('space-marines', content)
    expect(isReferenceDetachment(loaded, null, loaded.factions[0]!, { id: 'detachment', name })).toBe(expected)
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
      supplementalArmyRules: new Map(),
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
    expect(factionsFor(loaded, rules).factions[0]?.detachments[0]?.referenceRoute).toEqual({
      catalogueId: 'child',
      slug: 'emperors-shield',
    })
  })

  it('routes a chapter offer to the parent that publishes its reference', () => {
    const loaded = bookOf({
      name: 'Dark Angels',
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
              selectionEntries: [{ id: 'assault', name: 'Assault Brethren', type: 'upgrade' }],
            },
          ],
        },
      ],
    })
    const chapter = loaded.factions[0]!
    const detachment = loaded.detachments.get(chapter.id)!.options[0]!
    const parent = { id: 'parent', name: 'Space Marines', references: [] }
    loaded.factions.push(parent)
    loaded.index.catalogueOf.set(detachment.id, parent.id)
    loaded.detachments.set(parent.id, { ...loaded.detachments.get(chapter.id)!, options: [detachment] })
    const reference = { enhancements: 0, upgrades: 0, stratagems: 0, points: 1, dispositions: [] }
    const rules = {
      factionKeys: new Map([
        ['dark-angels', 'dark-angels'],
        ['space-marines', 'space-marines'],
      ]),
      detachmentReferences: new Map([
        ['dark-angels', new Map([[detachment.name, reference]])],
        ['space-marines', new Map([[detachment.name, reference]])],
      ]),
    } as Partial<LoadedRules> as LoadedRules

    const factions = factionsFor(loaded, rules).factions
    expect(factions.find((faction) => faction.id === chapter.id)?.references[0]?.detachments).toBe(0)
    expect(factions.find((faction) => faction.id === chapter.id)?.detachments[0]?.referenceRoute).toEqual({
      catalogueId: 'space-marines',
      slug: 'assault-brethren',
    })
  })
})

describe('detachments offering a force disposition', () => {
  const detachment = (id: string, dispositions: string[], reference: { points: number | null } | null = { points: 2 }) => ({
    id,
    slug: id,
    name: id,
    dispositions: dispositions.map((disposition) => ({ id: disposition })),
    reference,
  })
  const faction = (
    slug: string,
    detachments: ReturnType<typeof detachment>[],
    referenceDetachmentIds = detachments.map((entry) => entry.id),
  ) => ({
    slug,
    displayName: slug,
    icon: null,
    referenceDetachmentIds,
    detachments,
  })

  it('lists a detachment that offers the disposition among others', () => {
    const factions = [faction('orks', [detachment('war-horde', ['disruption', 'purge-the-foe'])])]
    expect(detachmentsOffering(factions, 'purge-the-foe')).toEqual([
      { slug: 'orks', displayName: 'orks', icon: null, detachments: [{ slug: 'war-horde', name: 'war-horde', points: 2 }] },
    ])
  })

  it('omits a faction whose detachments offer other dispositions', () => {
    expect(detachmentsOffering([faction('orks', [detachment('war-horde', ['disruption'])])], 'purge-the-foe')).toEqual([])
  })

  it('omits a detachment a chapter repeats from its parent', () => {
    const factions = [faction('blood-angels', [detachment('gladius', ['take-and-hold'])], [])]
    expect(detachmentsOffering(factions, 'take-and-hold')).toEqual([])
  })

  it('omits a detachment without a reference page', () => {
    const factions = [faction('orks', [detachment('war-horde', ['disruption'], null)])]
    expect(detachmentsOffering(factions, 'disruption')).toEqual([])
  })

  it('lists a faction once, from its default rules version', () => {
    const factions = [
      faction('dark-angels', [detachment('inner-circle', ['take-and-hold'])]),
      { ...faction('dark-angels', [detachment('inner-circle', ['take-and-hold'])]), isDefault: false },
    ]
    expect(detachmentsOffering(factions, 'take-and-hold')).toHaveLength(1)
  })

  it('orders factions by name', () => {
    const factions = [
      faction('tyranids', [detachment('swarm', ['disruption'])]),
      faction('necrons', [detachment('awakened', ['disruption'])]),
    ]
    expect(detachmentsOffering(factions, 'disruption').map((entry) => entry.slug)).toEqual(['necrons', 'tyranids'])
  })
})

it('names root rules from the faction points release', () => {
  const loaded = bookOf({ name: 'Adeptus Custodes', selectionEntries: [{ id: 'unit', name: 'Unit', type: 'unit' }] })
  loaded.mfm = new Map([['adeptus-custodes', { slug: 'adeptus-custodes', version: '1.5', units: [] }]])
  expect(factionsFor(loaded, null).factions[0]?.rulesName).toBe('MFM 1.5')
})

it('does not present authored points as an official MFM release', () => {
  const loaded = bookOf({ name: 'Adeptus Custodes', selectionEntries: [{ id: 'unit', name: 'Unit', type: 'unit' }] })
  loaded.mfm = new Map([['adeptus-custodes', { slug: 'adeptus-custodes', version: '1.5', attribution: 'Community preview', units: [] }]])
  expect(factionsFor(loaded, null).factions[0]?.rulesName).toBeUndefined()
})

it('uses the single source MFM release for faction aliases without a matching points slug', () => {
  const loaded = bookOf({ name: 'Agents of the Imperium', selectionEntries: [{ id: 'unit', name: 'Unit', type: 'unit' }] })
  loaded.mfm = new Map([['imperial-agents', { slug: 'imperial-agents', version: '1.5', units: [] }]])
  expect(factionsFor(loaded, null).factions[0]?.rulesName).toBe('MFM 1.5')
})

it('does not guess a release for an unmatched faction when points sources have different versions', () => {
  const loaded = bookOf({ name: 'Agents of the Imperium', selectionEntries: [{ id: 'unit', name: 'Unit', type: 'unit' }] })
  loaded.mfm = new Map([
    ['imperial-agents', { slug: 'imperial-agents', version: '1.5', units: [] }],
    ['space-marines', { slug: 'space-marines', version: '1.4', units: [] }],
  ])
  expect(factionsFor(loaded, null).factions[0]?.rulesName).toBeUndefined()
})

it('projects no factions when the requested scope is empty', () => {
  const loaded = bookOf({ name: 'Army', selectionEntries: [{ id: 'unit', name: 'Unit', type: 'unit' }] })
  expect(factionsFor(loaded, null, new Set()).factions).toEqual([])
})
