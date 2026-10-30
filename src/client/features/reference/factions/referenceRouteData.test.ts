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

it.each([
  ['an earlier slug of a datasheet to its current page for now only', 'azrael-azrael-s', 307, 'no-store'],
  ['a datasheet entry id to its page for good', 'azrael-sheet', 301, 'public, max-age=3600'],
])('moves %s', async (_, slug, statusCode, cacheControl) => {
  const redirect: Response & { options: unknown } = await loadFactionDatasheet(datasheetClient(slug, azrael), 'dark-angels', slug).then(
    () => expect.fail('Expected a redirect'),
    (thrown) => thrown,
  )
  expect([redirect.options, redirect.headers.get('cache-control')]).toMatchObject([
    { href: '/factions/dark-angels/datasheets/azrael', statusCode },
    cacheControl,
  ])
})

it('finds no page for an unknown datasheet address', async () => {
  const client = datasheetClient('nobody', null)

  await expect(loadFactionDatasheet(client, 'dark-angels', 'nobody')).rejects.toMatchObject({ isNotFound: true })
  client.clear()
})
