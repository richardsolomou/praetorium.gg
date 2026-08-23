import { describe, expect, it } from 'vitest'
import { detachmentCatalogueDetail } from './catalogueDescriptions'
import { detachmentsOf, isReferenceDetachment } from './catalogueIndex'
import { buildIndex, type Catalogue, type CatalogueFile } from '../core/catalogue'
import { ability, bookOf, points, shelfOf, system } from './catalogue.fixtures'

describe('detachment enhancements', () => {
  const detail = (...entries: NonNullable<Catalogue['sharedSelectionEntries']>) => {
    const loaded = bookOf({
      sharedSelectionEntries: [
        {
          id: 'wrapper',
          name: 'Detachment',
          type: 'upgrade',
          selectionEntryGroups: [
            { id: 'choices', name: 'Detachment', selectionEntries: [{ id: 'host', name: 'Plague Host', type: 'upgrade' }] },
          ],
        },
        ...entries,
      ],
    })
    return detachmentCatalogueDetail(loaded, 'cat', 'host', ['Living Relic'])?.enhancements[0]
  }

  it('finds description text without a detachment comment', () => {
    expect(
      detail({ id: 'relic', name: 'Living Relic', type: 'upgrade', profiles: [ability('relic-rule', 'Living Relic')] })?.description,
    ).toBe('Living Relic text')
  })

  it('matches an aura suffix supplied by the rules source', () => {
    expect(
      detail({ id: 'relic', name: 'Living Relic (Aura)', type: 'upgrade', profiles: [ability('relic-rule', 'Living Relic')] })?.description,
    ).toBe('Living Relic text')
  })

  it('prefers the entry named for the detachment', () => {
    expect(
      detail(
        { id: 'other', name: 'Living Relic', type: 'upgrade', comment: 'Other Host', profiles: [ability('other-rule', 'Other')] },
        { id: 'relic', name: 'Living Relic', type: 'upgrade', comment: 'Plague Host', profiles: [ability('relic-rule', 'Living Relic')] },
      )?.description,
    ).toBe('Living Relic text')
  })

  it('does not choose between conflicting descriptions', () => {
    expect(
      detail(
        { id: 'first', name: 'Living Relic', type: 'upgrade', profiles: [ability('first-rule', 'First')] },
        { id: 'second', name: 'Living Relic', type: 'upgrade', profiles: [ability('second-rule', 'Second')] },
      )?.description,
    ).toBeNull()
  })

  it('finds an enhancement the detachment makes mandatory on its bearer', () => {
    const loaded = bookOf({
      sharedSelectionEntries: [
        {
          id: 'wrapper',
          name: 'Detachment',
          type: 'upgrade',
          selectionEntryGroups: [
            { id: 'choices', name: 'Detachment', selectionEntries: [{ id: 'host', name: 'Pantheon', type: 'upgrade' }] },
          ],
        },
        {
          id: 'binding',
          name: 'Singularity Matrix',
          type: 'upgrade',
          hidden: true,
          costs: points(45),
          constraints: [{ id: 'binding-min', type: 'min', value: 0, field: 'selections', scope: 'parent' }],
          profiles: [ability('binding-rule', 'Singularity Matrix')],
          modifierGroups: [
            {
              conditions: [{ type: 'atLeast', value: 1, field: 'selections', scope: 'force', childId: 'host' }],
              modifiers: [{ type: 'set', field: 'binding-min', value: 1 }],
            },
          ],
        },
      ],
    })

    expect(detachmentCatalogueDetail(loaded, 'cat', 'host', [])?.forcedEnhancements).toEqual([
      { name: 'Singularity Matrix', points: 45, description: 'Singularity Matrix text' },
    ])
  })
})

describe('detachments', () => {
  it('keeps an imported detachment on its defining faction reference page', () => {
    const loaded = shelfOf(
      {
        name: 'Space Marines',
        selectionEntries: [{ id: 'marine', name: 'Marine', type: 'unit' }],
        sharedSelectionEntries: [
          {
            id: 'wrapper',
            name: 'Detachment',
            type: 'upgrade',
            selectionEntryGroups: [
              { id: 'choices', name: 'Detachment', selectionEntries: [{ id: 'gladius', name: 'Gladius Task Force', type: 'upgrade' }] },
            ],
          },
        ],
      },
      {
        name: 'Ultramarines',
        catalogueLinks: [{ targetId: 'cat', importRootEntries: true }],
      },
    )

    expect(loaded.detachments.get('cat-1')?.options.map((option) => option.id)).toEqual(['gladius'])
    expect(isReferenceDetachment(loaded, 'cat', 'gladius')).toBe(true)
    expect(isReferenceDetachment(loaded, 'cat-1', 'gladius')).toBe(false)
  })

  it('resolve a linked group used by newer catalogues', () => {
    const file: CatalogueFile = {
      catalogue: {
        id: 'cat',
        name: 'Test catalogue',
        sharedSelectionEntries: [
          {
            id: 'wrapper',
            name: 'Detachment',
            type: 'upgrade',
            entryLinks: [{ id: 'link', name: 'Detachment', type: 'selectionEntryGroup', targetId: 'choices' }],
          },
        ],
        sharedSelectionEntryGroups: [
          {
            id: 'choices',
            name: 'Detachment',
            selectionEntries: [{ id: 'speed', name: 'Kult of Speed', type: 'upgrade' }],
          },
        ],
      },
    }
    const index = buildIndex([system, file], 'test-revision')
    expect(
      detachmentsOf([system, file], index)
        .get('cat')
        ?.options.map((option) => option.name),
    ).toEqual(['Kult of Speed'])
  })

  it('takes the detachments of the book it imports most of its roster from', () => {
    // A chapter has no detachment entry of its own and several books it can reach.
    // Which one it plays with is decided by which one it mostly is, not by which
    // holds the longer list: preferring the longer one gave World Eaters the
    // Daemons detachments and Adeptus Custodes the Knights ones.
    const auxiliary: CatalogueFile = {
      catalogue: {
        id: 'auxiliary',
        name: 'Auxiliary catalogue',
        selectionEntries: [{ id: 'agent', name: 'Agent', type: 'unit' }],
        sharedSelectionEntries: [
          {
            id: 'aux-wrapper',
            name: 'Detachment',
            type: 'upgrade',
            selectionEntryGroups: [
              {
                id: 'aux-choices',
                name: 'Detachment',
                selectionEntries: [
                  { id: 'auxiliary-force', name: 'Auxiliary Force', type: 'upgrade' },
                  { id: 'ordo', name: 'Ordo Xenos', type: 'upgrade' },
                ],
              },
            ],
          },
        ],
      },
    }
    const base: CatalogueFile = {
      catalogue: {
        id: 'base',
        name: 'Base catalogue',
        selectionEntries: [
          { id: 'marine', name: 'Marine', type: 'unit' },
          { id: 'tank', name: 'Tank', type: 'unit' },
          { id: 'scout', name: 'Scout', type: 'unit' },
        ],
        sharedSelectionEntries: [
          {
            id: 'wrapper',
            name: 'Detachment',
            type: 'upgrade',
            selectionEntryGroups: [
              {
                id: 'choices',
                name: 'Detachment',
                selectionEntries: [{ id: 'gladius', name: 'Gladius Task Force', type: 'upgrade' }],
              },
            ],
          },
        ],
      },
    }
    const supplement: CatalogueFile = {
      catalogue: {
        id: 'supplement',
        name: 'Supplement',
        catalogueLinks: [
          { targetId: 'auxiliary', importRootEntries: true },
          { targetId: 'base', importRootEntries: true },
        ],
      },
    }
    const files = [system, auxiliary, base, supplement]
    const index = buildIndex(files, 'test-revision')
    expect(
      detachmentsOf(files, index)
        .get('supplement')
        ?.options.map((option) => option.name),
    ).toEqual(['Gladius Task Force'])
  })

  it('leaves a book with the detachments it states itself', () => {
    // Even where a book it imports offers more of them.
    const parent: CatalogueFile = {
      catalogue: {
        id: 'parent',
        name: 'Parent catalogue',
        selectionEntries: [{ id: 'daemon', name: 'Daemon', type: 'unit' }],
        sharedSelectionEntries: [
          {
            id: 'parent-wrapper',
            name: 'Detachment',
            type: 'upgrade',
            selectionEntryGroups: [
              {
                id: 'parent-choices',
                name: 'Detachment',
                selectionEntries: [
                  { id: 'incursion', name: 'Daemonic Incursion', type: 'upgrade' },
                  { id: 'legion', name: 'Blood Legion', type: 'upgrade' },
                ],
              },
            ],
          },
        ],
      },
    }
    const own: CatalogueFile = {
      catalogue: {
        id: 'own',
        name: 'Own catalogue',
        catalogueLinks: [{ targetId: 'parent', importRootEntries: true }],
        sharedSelectionEntries: [
          {
            id: 'own-wrapper',
            name: 'Detachments',
            type: 'upgrade',
            selectionEntryGroups: [
              { id: 'own-choices', name: 'Detachment', selectionEntries: [{ id: 'warband', name: 'Berzerker Warband', type: 'upgrade' }] },
            ],
          },
        ],
      },
    }
    const files = [system, parent, own]
    const index = buildIndex(files, 'test-revision')
    expect(
      detachmentsOf(files, index)
        .get('own')
        ?.options.map((option) => option.name),
    ).toEqual(['Berzerker Warband'])
  })
})
