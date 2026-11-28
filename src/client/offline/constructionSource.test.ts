import { expect, it } from 'vitest'
import { loadConstructionData } from './constructionSource'

const catalogue = { version: 1, revision: 'base', files: [], datacards: {}, mfm: null, editions: [] }
const rules = { revision: 'base', rules: {} }
const reading = (parts: Record<string, unknown>) => async (asset: string) => structuredClone(parts[asset])

it('reads VS Data from its own part', async () => {
  const vsPoints = { from: 'its own part' } as never
  const data = await loadConstructionData(
    { catalogue: '/catalogue', rules: '/rules', vs: '/vs', editions: {} },
    undefined,
    reading({ '/catalogue': catalogue, '/rules': rules, '/vs': { vsPoints } }),
  )
  expect(data.vsPoints).toEqual(vsPoints)
})

it('reads VS Data from the catalogue part of a download published before it had its own', async () => {
  const vsPoints = { from: 'the catalogue part' } as never
  const data = await loadConstructionData(
    { catalogue: '/catalogue', rules: '/rules', editions: {} },
    undefined,
    reading({ '/catalogue': { ...catalogue, vsPoints }, '/rules': rules }),
  )
  expect(data.vsPoints).toEqual(vsPoints)
})

it('reads the frozen import names from their own part', async () => {
  const importEntryNames = { from: 'their own part' } as never
  const data = await loadConstructionData(
    { catalogue: '/catalogue', rules: '/rules', importNames: '/names', editions: {} },
    undefined,
    reading({ '/catalogue': catalogue, '/rules': rules, '/names': { importEntryNames } }),
  )
  expect(data.importEntryNames).toEqual(importEntryNames)
})

it('reads the rest of a download whose import names part cannot be read', async () => {
  const data = await loadConstructionData(
    { catalogue: '/catalogue', rules: '/rules', importNames: '/names', editions: {} },
    undefined,
    async (asset) => {
      if (asset === '/names') throw new Error('not stored')
      return structuredClone({ '/catalogue': catalogue, '/rules': rules }[asset])
    },
  )
  expect(data.rules).toEqual(rules.rules)
})
