import { expect, it } from 'vitest'
import { recordedDurations, shardTitles, testTitles } from './e2eShard'

const report = (results: { status: string; duration: number }[]) => ({
  suites: [
    {
      title: 'battle.spec.ts',
      file: 'battle.spec.ts',
      specs: [{ title: 'opens a battle', tests: [{ results }] }],
      suites: [{ title: 'a phone', file: 'battle.spec.ts', specs: [{ title: 'scores a round', tests: [{ results }] }] }],
    },
  ],
})

it('names a test by its file, describe blocks and title', () => {
  expect(testTitles(report([]))).toEqual(['battle.spec.ts › opens a battle', 'battle.spec.ts › a phone › scores a round'])
})

it('records a passing test in seconds', () => {
  expect(recordedDurations(report([{ status: 'passed', duration: 12_345 }]))['battle.spec.ts › opens a battle']).toBe(12.3)
})

it('records nothing for a test that timed out', () => {
  expect(recordedDurations(report([{ status: 'timedOut', duration: 120_000 }]))).toEqual({})
})

it('keeps the two longest tests on different runners', () => {
  const durations = { a: 40, b: 1, c: 1, d: 39, e: 1 }

  expect(shardTitles(Object.keys(durations), durations, 1, 2)).toEqual(['a', 'c'])
})

it('weighs an unrecorded test as the median', () => {
  const durations = { a: 10, b: 10, c: 1 }

  expect(shardTitles(['a', 'b', 'c', 'new'], durations, 2, 2)).toEqual(['b', 'c'])
})

it('gives every test to exactly one runner', () => {
  const titles = Array.from({ length: 11 }, (_, index) => `test ${index}`)
  const durations = Object.fromEntries(titles.map((title, index) => [title, (index * 7) % 5]))
  const shards = [1, 2, 3].map((current) => shardTitles(titles, durations, current, 3))

  expect(shards.flat().toSorted()).toEqual(titles.toSorted())
})

it('refuses a runner outside the shard count', () => {
  expect(() => shardTitles(['a'], {}, 4, 3)).toThrow('shard must be between 1 and 3, got 4')
})
