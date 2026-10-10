import { QueryClient } from '@tanstack/react-query'
import { expect, it } from 'vitest'
import { factionIndexQuery, factionQuery, loadReferenceFaction } from './references'
import type { faction, factionIndex } from '../../server/functions'

const current: NonNullable<Awaited<ReturnType<typeof faction>>> = {
  id: 'book',
  slug: 'adeptus-custodes',
  baseCatalogueId: 'book',
  displayName: 'Adeptus Custodes',
  name: 'Adeptus Custodes',
  icon: null,
  edition: null,
  isDefault: true,
  references: [],
  detachments: [],
  armyRules: [],
  referenceDetachmentIds: [],
}

it('loads the exact rules version selected by a readable reference URL', async () => {
  const client = new QueryClient()
  const preview = {
    ...current,
    id: 'preview~book',
    edition: {
      id: 'preview',
      name: 'Custodes codex',
      status: 'preview' as const,
      default: false,
      catalogueIds: ['book'],
      releases: [{ at: 1, status: 'preview' as const }],
    },
  }
  const index: NonNullable<Awaited<ReturnType<typeof factionIndex>>> = { revision: 'rev', factions: [current, preview] }
  client.setQueryData(factionIndexQuery().queryKey, index)
  client.setQueryData(factionQuery(current.id).queryKey, current)
  client.setQueryData(factionQuery(preview.id).queryKey, preview)

  expect(await loadReferenceFaction(client, 'adeptus-custodes', 'preview')).toBe(preview)
  client.clear()
})

it('does not fall back to current rules for an unknown selected version', async () => {
  const client = new QueryClient()
  const index: NonNullable<Awaited<ReturnType<typeof factionIndex>>> = { revision: 'rev', factions: [current] }
  client.setQueryData(factionIndexQuery().queryKey, index)
  client.setQueryData(factionQuery(current.id).queryKey, current)
  client.setQueryData(factionQuery('missing~book').queryKey, null)

  expect(await loadReferenceFaction(client, 'adeptus-custodes', 'missing')).toBeNull()
  client.clear()
})
