import { expect, it } from 'vitest'
import { catalogueEditionSchema, editionCatalogueFiles, picksForCatalogueEdition, leagueEditionError } from './catalogueEdition'
import type { CatalogueFile } from './catalogue'

const preview = {
  id: 'custodes-codex',
  name: 'Custodes codex',
  status: 'preview',
  default: false,
  catalogueIds: ['custodes'],
  releases: [{ at: 1, status: 'preview' }],
} as const

it('retains keyed picks and equipment while moving allied book references between codexes', () => {
  const picks = [{ key: 7, entryId: 'guard', catalogueId: 'allies', models: 5, choices: { weapon: 'spear' } }]
  expect(picksForCatalogueEdition(picks, 'custodes-codex~custodes')).toEqual([{ ...picks[0], catalogueId: 'custodes-codex~allies' }])
  expect(picksForCatalogueEdition(picksForCatalogueEdition(picks, 'custodes-codex~custodes'), 'custodes')).toEqual(picks)
})

it('keeps previews out of the default rules', () => {
  expect(catalogueEditionSchema.safeParse({ ...preview, default: true }).success).toBe(false)
})

it('requires promotion to append to the codex release timeline', () => {
  expect(catalogueEditionSchema.safeParse({ ...preview, status: 'released', default: true }).success).toBe(false)
})

it('accepts promotion without changing the codex identity', () => {
  expect(
    catalogueEditionSchema.parse({
      ...preview,
      status: 'released',
      default: true,
      releases: [...preview.releases, { at: 2, status: 'released' }],
    }).id,
  ).toBe('custodes-codex')
})

it('rejects release events that go backwards in time', () => {
  expect(
    catalogueEditionSchema.safeParse({
      ...preview,
      releases: [
        { at: 2, status: 'preview' },
        { at: 1, status: 'preview' },
      ],
    }).success,
  ).toBe(false)
})

it('qualifies books and their references without changing unit or option identities', () => {
  const edition = catalogueEditionSchema.parse(preview)
  const files: CatalogueFile[] = [
    {
      catalogue: {
        id: 'custodes',
        name: 'Custodes',
        catalogueLinks: [{ targetId: 'library' }],
        sharedSelectionEntries: [
          {
            id: 'guard',
            name: 'Guard',
            modifiers: [
              {
                type: 'set',
                field: 'hidden',
                value: true,
                conditions: [{ type: 'equalTo', field: 'catalogue', value: 1, scope: 'force', childId: 'custodes' }],
              },
            ],
          },
        ],
      },
    },
    { catalogue: { id: 'library', name: 'Library', library: true } },
  ]
  expect(editionCatalogueFiles(files, edition)).toMatchObject([
    {
      catalogue: {
        id: 'custodes-codex~custodes',
        catalogueLinks: [{ targetId: 'custodes-codex~library' }],
        sharedSelectionEntries: [{ id: 'guard', modifiers: [{ conditions: [{ childId: 'custodes-codex~custodes' }] }] }],
      },
    },
    { catalogue: { id: 'custodes-codex~library' } },
  ])
  expect(files[0]!.catalogue?.id).toBe('custodes')
})

it.each(['released', 'retired'] as const)('allows %s codexes in leagues', (status) => {
  expect(leagueEditionError({ status })).toBeNull()
})
it('rejects preview codexes in leagues', () => {
  expect(leagueEditionError({ status: 'preview' })).toBe('preview rules cannot be submitted to a league')
})
