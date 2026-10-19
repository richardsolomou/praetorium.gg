import { expect, it } from 'vitest'
import { catalogueSources } from './catalogueSources'
import { catalogueCompositionSchema, validateEditionContinuity } from './catalogueComposition'

const edition = {
  id: 'custodes-codex',
  name: 'Custodes codex',
  status: 'preview',
  default: false,
  catalogueIds: ['custodes'],
  releases: [{ at: 1, status: 'preview' }],
}
const composition = () =>
  catalogueCompositionSchema.parse({
    format: 'praetorium.catalogue-composition.v1',
    overlays: [],
    editions: [{ edition, sources: {}, overlays: [] }],
  })
const overlay = { source: 'definitions', ...catalogueSources.definitions, files: ['Custodes.json'] }

it('accepts the same retired Git commit fetched from upstream instead of a fork', () => {
  const previous = composition()
  previous.editions[0]!.edition.status = 'retired'
  previous.editions[0]!.edition.releases = [{ at: 1, status: 'retired' }]
  previous.editions[0]!.sources.definitions = { ...catalogueSources.definitions, repository: 'contributor/catalogues' }
  const next = structuredClone(previous)
  next.editions[0]!.sources.definitions!.repository = catalogueSources.definitions.repository

  expect(() => validateEditionContinuity(previous, next)).not.toThrow()
})

it('requires exact commit pins for every overlay', () => {
  expect(catalogueCompositionSchema.safeParse({ ...composition(), overlays: [{ ...overlay, revision: 'main' }] }).success).toBe(false)
})

it.each(['../Custodes.json', '/Custodes.json', 'a/../../Custodes.json', 'a\\Custodes.json'])('rejects unsafe overlay path %s', (file) => {
  expect(catalogueCompositionSchema.safeParse({ ...composition(), overlays: [{ ...overlay, files: [file] }] }).success).toBe(false)
})

it('rejects two overlays replacing the same file', () => {
  expect(catalogueCompositionSchema.safeParse({ ...composition(), overlays: [overlay, overlay] }).success).toBe(false)
})

it('rejects two default editions for the same faction', () => {
  const released = { ...edition, status: 'released', default: true, releases: [{ at: 1, status: 'released' }] }
  expect(
    catalogueCompositionSchema.safeParse({
      ...composition(),
      editions: [
        { edition: released, sources: {}, overlays: [] },
        { edition: { ...released, id: 'another-codex' }, sources: {}, overlays: [] },
      ],
    }).success,
  ).toBe(false)
})

it('preserves preview history when the codex becomes the default', () => {
  const previous = composition()
  const next = composition()
  Object.assign(next.editions[0]!.edition, {
    status: 'released',
    default: true,
    releases: [...edition.releases, { at: 2, status: 'released' }],
  })
  expect(() => validateEditionContinuity(previous, next)).not.toThrow()
})

it('refuses to rewrite a previously published release event', () => {
  const previous = composition()
  const next = composition()
  next.editions[0]!.edition.releases[0]!.at = 2
  expect(() => validateEditionContinuity(previous, next)).toThrow('cannot rewrite published release history')
})

it.each(['custodes-codex', 'dated-codex'])('rejects a rules slug that conflicts with another edition URL %s', (slug) => {
  const original = { ...composition().editions[0]!, edition: { ...composition().editions[0]!.edition, slug: 'dated-codex' } }
  expect(
    catalogueCompositionSchema.safeParse({
      ...composition(),
      editions: [original, { ...original, edition: { ...original.edition, id: 'another-codex', slug } }],
    }).success,
  ).toBe(false)
})

it('refuses to change a published rules slug', () => {
  const previous = composition()
  previous.editions[0]!.edition.slug = 'custodes-codex-2026-10-17'
  const next = structuredClone(previous)
  next.editions[0]!.edition.slug = 'another-slug'
  expect(() => validateEditionContinuity(previous, next)).toThrow('cannot change its published rules slug')
})

it('retains old editions for saved lists', () => {
  expect(() => validateEditionContinuity(composition(), null)).toThrow('retire it instead of deleting it')
})

it.each(['released', 'retired'] as const)('keeps %s source pins unchanged when a new MFM is published', (status) => {
  const previous = composition()
  previous.editions[0]!.edition.status = status
  previous.editions[0]!.edition.releases = [{ at: 1, status }]
  previous.editions[0]!.sources.points = catalogueSources.points
  const next = structuredClone(previous)
  next.editions[0]!.sources.points = { ...catalogueSources.points, revision: 'a'.repeat(40) }
  expect(() => validateEditionContinuity(previous, next)).toThrow(
    status === 'retired' ? 'is retired; keep its published sources' : 'add a new version for source changes',
  )
})

const mfm = (before: string, after: string) => ({
  previous: new Map([['custodes-codex', before]]),
  next: new Map([['custodes-codex', after]]),
})

it('lets a correction within the same MFM version update a released rules version', () => {
  const previous = composition()
  previous.editions[0]!.edition.status = 'released'
  previous.editions[0]!.edition.releases = [{ at: 1, status: 'released' }]
  previous.editions[0]!.sources.points = catalogueSources.points
  const next = structuredClone(previous)
  next.editions[0]!.sources.points = { ...catalogueSources.points, revision: 'a'.repeat(40) }
  expect(() => validateEditionContinuity(previous, next, mfm('1.5', '1.5'))).not.toThrow()
})

it('needs a new rules version for a new MFM version', () => {
  const previous = composition()
  previous.editions[0]!.edition.status = 'released'
  previous.editions[0]!.edition.releases = [{ at: 1, status: 'released' }]
  previous.editions[0]!.sources.points = catalogueSources.points
  const next = structuredClone(previous)
  next.editions[0]!.sources.points = { ...catalogueSources.points, revision: 'a'.repeat(40) }
  expect(() => validateEditionContinuity(previous, next, mfm('1.5', '1.6'))).toThrow('publishes MFM 1.5; add a new version for MFM 1.6')
})

it('keeps a retired rules version unchanged even within its MFM version', () => {
  const previous = composition()
  previous.editions[0]!.edition.status = 'retired'
  previous.editions[0]!.edition.releases = [{ at: 1, status: 'retired' }]
  previous.editions[0]!.sources.points = catalogueSources.points
  const next = structuredClone(previous)
  next.editions[0]!.sources.points = { ...catalogueSources.points, revision: 'a'.repeat(40) }
  expect(() => validateEditionContinuity(previous, next, mfm('1.4', '1.4'))).toThrow('is retired; keep its published sources')
})

it('keeps inherited released rules unchanged when the root sources change', () => {
  const previous = composition()
  previous.baseSources = catalogueSources
  previous.editions[0]!.edition.status = 'released'
  previous.editions[0]!.edition.releases = [{ at: 1, status: 'released' }]
  const next = structuredClone(previous)
  next.baseSources!.points.revision = 'a'.repeat(40)
  expect(() => validateEditionContinuity(previous, next)).toThrow('add a new version for source changes')
})

it('can publish a new points version while retiring the unchanged original', () => {
  const previous = composition()
  previous.editions[0]!.edition.status = 'released'
  previous.editions[0]!.edition.releases = [{ at: 1, status: 'released' }]
  previous.editions[0]!.sources.points = catalogueSources.points
  const next = structuredClone(previous)
  next.editions[0]!.edition.status = 'retired'
  next.editions[0]!.edition.releases.push({ at: 2, status: 'retired' })
  next.editions.push({
    ...structuredClone(previous.editions[0]!),
    edition: { ...previous.editions[0]!.edition, id: 'mfm-1-6', default: true },
    sources: { points: { ...catalogueSources.points, revision: 'a'.repeat(40) } },
  })
  expect(() => validateEditionContinuity(previous, next)).not.toThrow()
})

const snapshot = { format: 'praetorium.catalogue-pointer.v1', id: 'a'.repeat(64), archiveSha256: 'b'.repeat(64) }

it('accepts an immutable historical snapshot as a retained edition', () => {
  expect(
    catalogueCompositionSchema.safeParse({
      ...composition(),
      editions: [
        { edition: { ...edition, status: 'retired', releases: [{ at: 1, status: 'retired' }] }, snapshot, sources: {}, overlays: [] },
      ],
    }).success,
  ).toBe(true)
})

it.each([
  { sources: { definitions: catalogueSources.definitions }, overlays: [] },
  { sources: {}, overlays: [overlay] },
])('refuses edits to an immutable snapshot edition', (overrides) => {
  expect(
    catalogueCompositionSchema.safeParse({
      ...composition(),
      editions: [{ edition, snapshot, ...overrides }],
    }).success,
  ).toBe(false)
})

it('refuses to replace a previously published historical snapshot', () => {
  const previous = composition()
  previous.editions[0]!.snapshot = snapshot as NonNullable<(typeof previous.editions)[number]['snapshot']>
  const next = structuredClone(previous)
  next.editions[0]!.snapshot!.id = 'c'.repeat(64)
  expect(() => validateEditionContinuity(previous, next)).toThrow('cannot replace its immutable snapshot')
})

it('keeps a historical snapshot independent of current source pins', () => {
  const previous = composition()
  previous.baseSources = catalogueSources
  previous.editions[0]!.snapshot = snapshot as NonNullable<(typeof previous.editions)[number]['snapshot']>
  previous.editions[0]!.edition.status = 'retired'
  previous.editions[0]!.edition.releases = [{ at: 1, status: 'retired' }]
  const next = structuredClone(previous)
  next.baseSources!.points.revision = 'a'.repeat(40)
  expect(() => validateEditionContinuity(previous, next)).not.toThrow()
})
