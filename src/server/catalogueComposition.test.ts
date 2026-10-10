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
