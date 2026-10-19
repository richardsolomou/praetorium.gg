import { execFileSync } from 'node:child_process'
import { beforeEach, expect, it, vi } from 'vitest'
import { catalogueSources } from '../../src/server/catalogueSources'
import { catalogueCompositionSchema } from '../../src/server/catalogueComposition'
import { battlemasterCatalogue } from '../../src/server/sync'
import { resolveCatalogueUpstream } from './catalogueUpstream'

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }))
vi.mock('../../src/server/sync', () => ({ battlemasterCatalogue: vi.fn() }))

const latest = 'b'.repeat(40)
const terrain = 'c'.repeat(64)
const overlay = {
  ...catalogueSources.definitions,
  repository: 'approved/codex',
  branch: 'feat/codex',
  source: 'definitions',
  files: ['Faction.json'],
}
const composition = () =>
  catalogueCompositionSchema.parse({
    format: 'praetorium.catalogue-composition.v1',
    overlays: [overlay, { ...overlay, source: 'datacards' }],
    editions: ['preview', 'released', 'retired'].map((status) => ({
      edition: { id: status, name: status, status, default: false, catalogueIds: ['cat'], releases: [{ at: 1, status }] },
      sources: {
        definitions: { ...catalogueSources.definitions, repository: `approved/${status}` },
        points: catalogueSources.points,
        datacards: catalogueSources.datacards,
      },
      overlays: [{ ...overlay, repository: `approved/${status}-overlay` }],
    })),
  })

beforeEach(() => {
  vi.mocked(execFileSync)
    .mockReset()
    .mockImplementation((_command, args) => `${latest}\t${(args as string[]).at(-1)}`)
  vi.mocked(battlemasterCatalogue)
    .mockReset()
    .mockResolvedValue({ catalog: { catalogKey: 'current', layouts: [] }, revision: terrain })
})

it('resolves all root sources and active rules while retaining historical pins', async () => {
  const before = composition()
  const historical = structuredClone(before.editions[2])
  const next = await resolveCatalogueUpstream(catalogueSources, before)

  expect({
    definitions: next.sources.definitions.revision,
    points: next.sources.points.revision,
    datacards: next.sources.datacards.revision,
    terrain: next.sources.battlemaster.revision,
    overlays: next.composition!.overlays.map((entry) => entry.revision),
    active: next.composition!.editions.slice(0, 2).map((entry) => [entry.sources.definitions!.revision, entry.overlays[0]!.revision]),
    retired: next.composition!.editions[2],
  }).toEqual({
    definitions: latest,
    points: latest,
    datacards: latest,
    terrain,
    overlays: [latest, latest],
    active: [
      [latest, latest],
      [latest, latest],
    ],
    retired: historical,
  })
})

it('resolves a shared branch once so every file uses the same commit', async () => {
  let reads = 0
  vi.mocked(execFileSync).mockImplementation((_command, args) => {
    const values = args as string[]
    const sha = values.includes('https://github.com/approved/codex.git') ? String(++reads).repeat(40) : latest
    return `${sha}\t${values.at(-1)}`
  })
  const next = await resolveCatalogueUpstream(catalogueSources, composition())

  expect(next.composition!.overlays.map((entry) => entry.revision)).toEqual(['1'.repeat(40), '1'.repeat(40)])
})

it('does not query historical source branches', async () => {
  await resolveCatalogueUpstream(catalogueSources, composition())

  expect(vi.mocked(execFileSync).mock.calls.some(([, args]) => (args as string[]).some((arg) => arg.includes('approved/retired')))).toBe(
    false,
  )
})

it('rejects branch names returned instead of commit identities', async () => {
  vi.mocked(execFileSync).mockReturnValue('main')

  await expect(resolveCatalogueUpstream(catalogueSources, composition())).rejects.toThrow('invalid upstream commit')
})

it('leaves its input manifests unchanged when a later source fails', async () => {
  const before = composition()
  const expected = structuredClone(before)
  vi.mocked(battlemasterCatalogue).mockRejectedValue(new Error('terrain unavailable'))

  await expect(resolveCatalogueUpstream(catalogueSources, before)).rejects.toThrow('terrain unavailable')

  expect(before).toEqual(expected)
})

it('refuses historical rules that inherit changing root sources', async () => {
  const before = composition()
  delete before.editions[2]!.sources.points

  await expect(resolveCatalogueUpstream(catalogueSources, before)).rejects.toThrow('retired must pin every source')
})
