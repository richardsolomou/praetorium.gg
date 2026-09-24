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
      {
        id: 'mission:test:mission',
        kind: 'mission',
        title: 'Test Mission',
        faction: null,
        url: '/mission-matchups/test/one/two#mission-test',
        sections: [
          {
            id: 'mission-test',
            title: 'Test Mission',
            text: 'Test scoring.',
            url: '/mission-matchups/test/one/two#mission-test',
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
        url: '/mission-packs/test/secondary-missions/test-secondary',
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
    entries: [] as { from: string; revisions: Record<string, string>; recordedAt: number; changes: { factions: []; omitted: number } }[],
  },
}))
vi.mock('./app', () => ({ app: () => ({ catalogueHistory: () => history.entries }) }))

import { updateId } from './catalogueHistory'
import { referenceLlms, referenceRobots, referenceSitemap } from './referenceDiscovery'

afterEach(() => {
  corpus.revision = 'snapshot-one'
  history.entries = []
})

const update = (from: string) => ({
  from,
  revisions: { definitions: `${from}-next` },
  recordedAt: 1,
  changes: { factions: [] as [], omitted: 1 },
})

it('lists canonical reference pages in the snapshot sitemap', async () => {
  const response = referenceSitemap(new Request('https://praetorium.gg/sitemap.xml'))

  expect(await response.text()).toMatch(
    /<url><loc>https:\/\/praetorium\.gg\/factions\/test\/datasheets\/unit<\/loc><\/url>.*<url><loc>https:\/\/praetorium\.gg\/factions\/test\/detachments\/detachment<\/loc><\/url>.*<url><loc>https:\/\/praetorium\.gg\/mission-matchups\/test\/one\/two<\/loc><\/url>.*<url><loc>https:\/\/praetorium\.gg\/mission-packs\/test\/secondary-missions\/test-secondary<\/loc><\/url>.*<url><loc>https:\/\/praetorium\.gg\/rules\/core\/movement<\/loc><\/url>/s,
  )
})

it('invalidates the sitemap ETag with the snapshot', () => {
  const request = new Request('https://praetorium.gg/sitemap.xml')
  const before = referenceSitemap(request).headers.get('etag')
  corpus.revision = 'snapshot-two'

  expect(referenceSitemap(request).headers.get('etag')).not.toBe(before)
})

it('lists the data updates the snapshot carries', async () => {
  history.entries = [update('a')]

  const body = await referenceSitemap(new Request('https://praetorium.gg/sitemap.xml')).text()

  expect([body.includes('/changes</loc>'), body.includes(`/changes/${updateId(update('a'))}</loc>`)]).toEqual([true, true])
})

it('lists no data updates for a snapshot that carries none', async () => {
  expect(await referenceSitemap(new Request('https://praetorium.gg/sitemap.xml')).text()).not.toContain('/changes')
})

it('invalidates the sitemap ETag when the history gains an update', () => {
  const request = new Request('https://praetorium.gg/sitemap.xml')
  const before = referenceSitemap(request).headers.get('etag')
  history.entries = [update('a')]

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
    /Praetorium guide.*Reference index.*search missions, deployments, terrain, rules, detachments, and datasheets.*instead of reading every datasheet.*Mission packs.*## Update model.*verified immutable snapshot.*## Licence and attribution.*AGPL-3\.0.*https:\/\/praetorium\.gg\/sources/s,
  )
})

it('serves conditional llms.txt responses', () => {
  const request = new Request('https://praetorium.gg/llms.txt')
  const etag = referenceLlms(request).headers.get('etag')!

  expect(referenceLlms(new Request(request, { headers: { 'If-None-Match': etag } })).status).toBe(304)
})
