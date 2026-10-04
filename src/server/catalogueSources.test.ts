import { expect, it } from 'vitest'
import { catalogueSources, catalogueSourcesSchema } from './catalogueSources'

it('rejects a branch name where an immutable source revision is required', () => {
  expect(() =>
    catalogueSourcesSchema.parse({ ...catalogueSources, definitions: { ...catalogueSources.definitions, revision: 'main' } }),
  ).toThrow('expected a full Git commit SHA')
})

it('rejects a source path outside its repository', () => {
  expect(() =>
    catalogueSourcesSchema.parse({ ...catalogueSources, datacards: { ...catalogueSources.datacards, path: '../11th/gdc' } }),
  ).toThrow('expected a relative source path')
})

it('rejects an empty icon selection', () => {
  expect(() => catalogueSourcesSchema.parse({ ...catalogueSources, icons: { ...catalogueSources.icons, icons: {} } })).toThrow(
    'icon selection is empty',
  )
})

it('rejects an icon name outside the selected icon directory', () => {
  expect(() =>
    catalogueSourcesSchema.parse({ ...catalogueSources, icons: { ...catalogueSources.icons, icons: { '../outside': 'test.svg' } } }),
  ).toThrow()
})

it('rejects an unverified terrain catalogue revision', () => {
  expect(() =>
    catalogueSourcesSchema.parse({ ...catalogueSources, battlemaster: { ...catalogueSources.battlemaster, revision: 'latest' } }),
  ).toThrow('expected a SHA-256 catalogue hash')
})
