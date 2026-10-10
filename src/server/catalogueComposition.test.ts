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
  expect(() => validateEditionContinuity(previous, next)).toThrow('add a new version for source changes')
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
