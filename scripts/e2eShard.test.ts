import { expect, it } from 'vitest'
import { medianDurations, planShards, recordedDurations, runnerSeconds, testTitles } from './e2eShard'

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

it('weighs a test by its median across runs', () => {
  const runs = [10_000, 30_000, 12_000].map((duration) => report([{ status: 'passed', duration }]))

  expect(medianDurations(runs)['battle.spec.ts › opens a battle']).toBe(12)
})

const full = runnerSeconds * 2

it('keeps the two longest tests on different runners', () => {
  const durations = { a: full, b: 1, c: 1, d: full - 1, e: 1 }

  expect(planShards(Object.keys(durations), durations, 2).shards[0]).toEqual(['a', 'c'])
})

it('weighs an unrecorded test as the median', () => {
  const durations = { a: full, b: full, c: 1 }

  expect(planShards(['a', 'b', 'c', 'new'], durations, 2).shards[1]).toEqual(['b', 'c'])
})

it('starts as many runners as the tests fill', () => {
  const durations = { a: full, b: full, c: full / 2 }

  expect(planShards(Object.keys(durations), durations, 14).shards).toHaveLength(3)
})

it('starts no more runners than the most allowed', () => {
  const durations = { a: full, b: full, c: full }

  expect(planShards(Object.keys(durations), durations, 2).shards).toHaveLength(2)
})

it('starts one runner for a single short test', () => {
  expect(planShards(['a'], { a: 1 }, 14).shards).toEqual([['a']])
})

it('gives every test to exactly one runner', () => {
  const titles = Array.from({ length: 11 }, (_, index) => `test ${index}`)
  const durations = Object.fromEntries(titles.map((title, index) => [title, full * ((index * 7) % 5)]))

  expect(planShards(titles, durations, 3).shards.flat().toSorted()).toEqual(titles.toSorted())
})

const even = Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`test ${index}`, full / 10]))

it('gives a desktop runner a lighter share of the tests', () => {
  const { shards } = planShards(Object.keys(even), even, 3, 1)

  expect(shards[1]!.length).toBeLessThan(shards[0]!.length / 2)
})

it('hands the desktop runners 2 onwards and keeps runner 1 hosted', () => {
  expect(planShards(Object.keys(even), even, 2, 4).desktop).toEqual([2])
})

it('hands the desktop nothing when it has no free slots', () => {
  expect(planShards(Object.keys(even), even, 3, 0).desktop).toEqual([])
})
