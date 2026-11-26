import { expect, it } from 'vitest'
import type { TextFacts } from '../core/textFacts'
import { downloadedTextFacts, textFactsByKey } from './offlineReference'
import { packRuntimeData, unpackRuntimeData } from './runtimeData'

const facts = new Map<string, TextFacts>([
  ['plain:a', { combat: null, linkedWeapon: true }],
  ['plain:b', { combat: null, linkedWeapon: true }],
  ['plain:c', { combat: null }],
])

it('keeps each distinct facts once in a download', () => {
  expect(downloadedTextFacts(facts).facts).toHaveLength(2)
})

it('reads every key back from a download, and from one saved as a map of every key', () => {
  const saved = (value: unknown) => textFactsByKey(unpackRuntimeData(packRuntimeData(value)))
  expect([saved(downloadedTextFacts(facts)), saved(facts)].map((read) => [...read])).toEqual([[...facts], [...facts]])
})
