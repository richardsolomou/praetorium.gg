import { afterEach, expect, it, vi } from 'vitest'

const { corpus } = vi.hoisted(() => ({
  corpus: {
    revision: 'snapshot-one',
    documents: [
      {
        id: 'datasheet:test:unit',
        kind: 'datasheet',
        title: 'Test Unit',
        faction: 'Test Faction',
        url: '/factions/test/datasheets/unit',
        sections: [],
        revisions: { definitions: 'revision' },
        attribution: ['Community data'],
      },
      {
        id: 'detachment:test:detachment',
        kind: 'detachment',
        title: 'Test Detachment',
        faction: 'Test Faction',
        url: '/factions/test/detachments/detachment',
        sections: [],
        revisions: { definitions: 'revision' },
        attribution: ['Community data'],
      },
    ],
    catalogue: {
      revisions: { definitions: 'revision' },
      datasheets: [{ referenceRoute: { catalogueId: 'test', slug: 'unit' } }],
      detachments: [{ factionSlug: 'test', slug: 'detachment' }],
      ruleDocuments: [
        {
          slug: 'core',
          sections: [{ slug: 'movement' }],
        },
      ],
    },
  },
}))

vi.mock('./referenceApi', () => ({ activeReferenceCorpus: () => corpus }))

import { referenceLlms, referenceRobots, referenceSitemap } from './referenceDiscovery'

afterEach(() => {
  corpus.revision = 'snapshot-one'
})

it('lists canonical reference pages in the snapshot sitemap', async () => {
  const response = referenceSitemap(new Request('https://praetorium.gg/sitemap.xml'))

  expect(await response.text()).toMatch(
    /<url><loc>https:\/\/praetorium\.gg\/factions\/test\/datasheets\/unit<\/loc><\/url>.*<url><loc>https:\/\/praetorium\.gg\/factions\/test\/detachments\/detachment<\/loc><\/url>.*<url><loc>https:\/\/praetorium\.gg\/rules\/core\/movement<\/loc><\/url>/s,
  )
})

it('invalidates the sitemap ETag with the snapshot', () => {
  const request = new Request('https://praetorium.gg/sitemap.xml')
  const before = referenceSitemap(request).headers.get('etag')
  corpus.revision = 'snapshot-two'

  expect(referenceSitemap(request).headers.get('etag')).not.toBe(before)
})

it('advertises the canonical sitemap to crawlers', async () => {
  expect(await referenceRobots(new Request('https://praetorium.gg/robots.txt')).text()).toMatch(
    /Allow: \/.*Sitemap: https:\/\/praetorium\.gg\/sitemap\.xml/s,
  )
})

it('documents reference updates, licensing, and attribution for agents', async () => {
  const response = referenceLlms(new Request('https://praetorium.gg/llms.txt'))

  expect(await response.text()).toMatch(
    /## Update model.*verified immutable snapshot.*## Licence and attribution.*AGPL-3\.0.*https:\/\/praetorium\.gg\/sources/s,
  )
})

it('serves conditional llms.txt responses', () => {
  const request = new Request('https://praetorium.gg/llms.txt')
  const etag = referenceLlms(request).headers.get('etag')!

  expect(referenceLlms(new Request(request, { headers: { 'If-None-Match': etag } })).status).toBe(304)
})
