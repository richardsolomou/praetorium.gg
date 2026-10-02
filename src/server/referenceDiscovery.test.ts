import { afterEach, expect, it, vi } from 'vitest'
import type { CatalogueHistoryEntry } from '../core/catalogueHistory'

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
      {
        id: 'mission:test:mission',
        kind: 'mission',
        title: 'Test Mission',
        faction: null,
        url: '/missions/test/matchups/one/two#mission-test',
        sections: [
          {
            id: 'mission-test',
            title: 'Test Mission',
            text: 'Test scoring.',
            url: '/missions/test/matchups/one/two#mission-test',
          },
        ],
        revisions: { rules: 'revision' },
        attribution: ['Community data'],
      },
      {
        id: 'mission:secondary:test-secondary',
        kind: 'mission',
        title: 'Test Secondary',
        faction: null,
        url: '/missions/test/secondaries/test-secondary',
        sections: [],
        revisions: { rules: 'revision' },
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

const { history } = vi.hoisted(() => ({
  history: {
    entries: [] as CatalogueHistoryEntry[],
  },
}))
const canonical = {
  datasheets: [{ catalogueId: 'test-catalogue', id: 'unit', referenceRoute: { catalogueId: 'test', slug: 'unit' } }],
  detachments: [],
}
const rules = {}
vi.mock('./app', () => ({
  app: () => ({
    catalogueHistoryFor: async () => history.entries,
    canonicalCatalogueFor: async () => canonical,
    battleReadRulesFor: async () => rules,
  }),
}))
vi.mock('./gameReferences', () => ({ gameReferencesFor: () => ({ dispositions: [{ id: 'take-and-hold' }] }) }))

import { referenceLlms, referenceRobots, referenceSitemap } from './referenceDiscovery'

afterEach(() => {
  corpus.revision = 'snapshot-one'
  history.entries = []
})

const update = (from: string, recordedAt = 1): CatalogueHistoryEntry => ({
  from,
  revisions: { definitions: `${from}-next` },
  recordedAt,
  changes: { factions: [], omitted: 1 },
})

const factionUpdate = (from: string, recordedAt: number): CatalogueHistoryEntry => ({
  ...update(from, recordedAt),
  changes: {
    factions: [
      { catalogueId: 'test-catalogue', faction: 'Test Faction', changes: [{ kind: 'datasheet-added', id: 'unit', name: 'Unit' }] },
    ],
    omitted: 0,
  },
})

const sitemap = async () => (await referenceSitemap(new Request('https://praetorium.gg/sitemap.xml'))).text()

it('lists canonical reference pages in the snapshot sitemap', async () => {
  const response = await referenceSitemap(new Request('https://praetorium.gg/sitemap.xml'))

  expect(await response.text()).toMatch(
    /<url><loc>https:\/\/praetorium\.gg\/factions\/test\/datasheets\/unit<\/loc><\/url>.*<url><loc>https:\/\/praetorium\.gg\/factions\/test\/detachments\/detachment<\/loc><\/url>.*<url><loc>https:\/\/praetorium\.gg\/missions\/test\/matchups\/one\/two<\/loc><\/url>.*<url><loc>https:\/\/praetorium\.gg\/missions\/test\/secondaries\/test-secondary<\/loc><\/url>.*<url><loc>https:\/\/praetorium\.gg\/rules\/core\/movement<\/loc><\/url>/s,
  )
})

it('invalidates the sitemap ETag with the snapshot', async () => {
  const request = new Request('https://praetorium.gg/sitemap.xml')
  const before = (await referenceSitemap(request)).headers.get('etag')
  corpus.revision = 'snapshot-two'

  expect((await referenceSitemap(request)).headers.get('etag')).not.toBe(before)
})

it('lists the data updates page once for a snapshot that carries any', async () => {
  history.entries = [update('a')]

  const body = await (await referenceSitemap(new Request('https://praetorium.gg/sitemap.xml'))).text()

  expect(body.match(/\/data-updates[^<]*<\/loc>/g)).toEqual(['/data-updates</loc>'])
})

it('lists the public pages no reference document names', async () => {
  expect(await sitemap()).toMatch(
    /<loc>https:\/\/praetorium\.gg\/<\/loc>.*<loc>https:\/\/praetorium\.gg\/leaderboard<\/loc>.*<loc>https:\/\/praetorium\.gg\/rosters<\/loc>.*<loc>https:\/\/praetorium\.gg\/simulator<\/loc>/s,
  )
})

it('dates the data updates page by its newest update', async () => {
  history.entries = [update('a', Date.UTC(2026, 8, 1)), update('b', Date.UTC(2026, 8, 5))]

  expect(await sitemap()).toContain('<loc>https://praetorium.gg/data-updates</loc><lastmod>2026-09-05T00:00:00.000Z</lastmod>')
})

it("dates a faction's data updates page by the newest update that reached it", async () => {
  history.entries = [factionUpdate('a', Date.UTC(2026, 8, 2)), update('b', Date.UTC(2026, 8, 5))]

  expect(await sitemap()).toContain('<loc>https://praetorium.gg/data-updates/test</loc><lastmod>2026-09-02T00:00:00.000Z</lastmod>')
})

it('dates a datasheet by the newest update that changed it', async () => {
  history.entries = [factionUpdate('a', Date.UTC(2026, 8, 2)), update('b', Date.UTC(2026, 8, 5))]

  expect(await sitemap()).toContain(
    '<loc>https://praetorium.gg/factions/test/datasheets/unit</loc><lastmod>2026-09-02T00:00:00.000Z</lastmod>',
  )
})

it('dates no reference page the history cannot date', async () => {
  history.entries = [factionUpdate('a', Date.UTC(2026, 8, 2))]

  expect(await sitemap()).toContain('<loc>https://praetorium.gg/factions/test/detachments/detachment</loc></url>')
})

it('lists every force disposition page', async () => {
  expect(await sitemap()).toMatch(
    /<loc>https:\/\/praetorium\.gg\/force-dispositions<\/loc>.*<loc>https:\/\/praetorium\.gg\/force-dispositions\/take-and-hold<\/loc>/s,
  )
})

it('lists no data updates for a snapshot that carries none', async () => {
  expect(await (await referenceSitemap(new Request('https://praetorium.gg/sitemap.xml'))).text()).not.toContain('/data-updates')
})

it('invalidates the sitemap ETag when the history gains an update', async () => {
  const request = new Request('https://praetorium.gg/sitemap.xml')
  const before = (await referenceSitemap(request)).headers.get('etag')
  history.entries = [update('a')]

  expect((await referenceSitemap(request)).headers.get('etag')).not.toBe(before)
})

it('advertises the canonical sitemap to crawlers', async () => {
  expect(await referenceRobots(new Request('https://praetorium.gg/robots.txt')).text()).toMatch(
    /Allow: \/.*Sitemap: https:\/\/praetorium\.gg\/sitemap\.xml/s,
  )
})

it('keeps crawlers off the sign-in page, which has a copy per return address', async () => {
  expect(await referenceRobots(new Request('https://praetorium.gg/robots.txt')).text()).toMatch(/Disallow: \/sign-in\nDisallow: \/signin\n/)
})

it('documents reference updates, licensing, and attribution for agents', async () => {
  const response = await referenceLlms(new Request('https://praetorium.gg/llms.txt'))

  expect(await response.text()).toMatch(
    /Praetorium guide.*Reference index.*search missions, deployments, terrain, rules, detachments, and datasheets.*instead of reading every datasheet.*Missions.*## Update model.*verified immutable snapshot.*## Licence and attribution.*AGPL-3\.0.*https:\/\/praetorium\.gg\/sources/s,
  )
})

it('serves conditional llms.txt responses', async () => {
  const request = new Request('https://praetorium.gg/llms.txt')
  const etag = (await referenceLlms(request)).headers.get('etag')!

  expect((await referenceLlms(new Request(request, { headers: { 'If-None-Match': etag } }))).status).toBe(304)
})

it('accepts a weak ETag for llms.txt', async () => {
  const request = new Request('https://praetorium.gg/llms.txt')
  const etag = (await referenceLlms(request)).headers.get('etag')!
  expect((await referenceLlms(new Request(request, { headers: { 'If-None-Match': `W/${etag}` } }))).status).toBe(304)
})
