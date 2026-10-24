import { QueryClient } from '@tanstack/react-query'
import { expect, it } from 'vitest'
import { datasheetSlugQuery, factionIndexQuery, factionQuery, favouriteDetachmentsQuery } from '../../../queries'
import type { datasheetBySlug, faction, factionIndex } from '../../../../server/functions'
import { loadFactionDatasheet, loadFactionDetachment } from './referenceRouteData'

const darkAngels: NonNullable<Awaited<ReturnType<typeof faction>>> = {
  id: 'dark-angels-book',
  slug: 'dark-angels',
  baseCatalogueId: 'dark-angels-book',
  displayName: 'Dark Angels',
  name: 'Dark Angels',
  icon: null,
  edition: null,
  isDefault: true,
  references: [],
  detachments: [
    {
      id: 'gladius',
      name: 'Gladius Task Force',
      slug: 'gladius-task-force',
      referenceRoute: { catalogueId: 'space-marines', slug: 'gladius-task-force' },
      points: null,
      disposition: null,
      exclusiveWith: [],
      dispositions: [],
      reference: null,
    },
  ],
  armyRules: [],
  referenceDetachmentIds: [],
}

it('sends a detachment printed by another faction to that faction’s page', async () => {
  const client = new QueryClient()
  const index: NonNullable<Awaited<ReturnType<typeof factionIndex>>> = { revision: 'rev', factions: [darkAngels] }
  client.setQueryData(factionIndexQuery().queryKey, index)
  client.setQueryData(factionQuery(darkAngels.slug).queryKey, darkAngels)
  client.setQueryData(favouriteDetachmentsQuery().queryKey, [])

  await expect(loadFactionDetachment(client, 'dark-angels', 'gladius-task-force')).rejects.toMatchObject({
    options: {
      to: '/factions/$catalogueId/detachments/$detachmentId',
      params: { catalogueId: 'space-marines', detachmentId: 'gladius-task-force' },
    },
  })
  client.clear()
})

function datasheetClient(slug: string, sheet: Awaited<ReturnType<typeof datasheetBySlug>>) {
  const client = new QueryClient()
  const index: NonNullable<Awaited<ReturnType<typeof factionIndex>>> = { revision: 'rev', factions: [darkAngels] }
  client.setQueryData(factionIndexQuery().queryKey, index)
  client.setQueryData(factionQuery(darkAngels.slug).queryKey, darkAngels)
  client.setQueryData(datasheetSlugQuery(darkAngels.id, slug).queryKey, sheet)
  return client
}

const azrael = { id: 'azrael-sheet', slug: 'azrael' } as NonNullable<Awaited<ReturnType<typeof datasheetBySlug>>>

it('moves an earlier slug of a datasheet to its current page for now only', async () => {
  const client = datasheetClient('azrael-azrael-s', azrael)

  await expect(loadFactionDatasheet(client, 'dark-angels', 'azrael-azrael-s')).rejects.toMatchObject({
    options: { href: '/factions/dark-angels/datasheets/azrael', statusCode: 307 },
  })
  client.clear()
})

it('keeps no copy of a temporary datasheet redirect', async () => {
  const client = datasheetClient('azrael-azrael-s', azrael)

  await expect(loadFactionDatasheet(client, 'dark-angels', 'azrael-azrael-s')).rejects.toSatisfy(
    (redirect: Response) => redirect.headers.get('cache-control') === 'no-store',
  )
  client.clear()
})

it('moves a datasheet entry id to its page for good', async () => {
  const client = datasheetClient('azrael-sheet', azrael)

  await expect(loadFactionDatasheet(client, 'dark-angels', 'azrael-sheet')).rejects.toMatchObject({
    options: { href: '/factions/dark-angels/datasheets/azrael', statusCode: 301 },
  })
  client.clear()
})

it('finds no page for an unknown datasheet address', async () => {
  const client = datasheetClient('nobody', null)

  await expect(loadFactionDatasheet(client, 'dark-angels', 'nobody')).rejects.toMatchObject({ isNotFound: true })
  client.clear()
})

it('lets a permanent datasheet redirect be cached for an hour', async () => {
  const client = datasheetClient('azrael-sheet', azrael)

  await expect(loadFactionDatasheet(client, 'dark-angels', 'azrael-sheet')).rejects.toSatisfy(
    (redirect: Response) => redirect.headers.get('cache-control') === 'public, max-age=3600',
  )
  client.clear()
})
