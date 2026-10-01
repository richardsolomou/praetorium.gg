import { describe, expect, it } from 'vitest'
import { replayPreloadBatches } from './replayPrefetch'

const points = (count: number) => Array.from({ length: count }, (_, index) => ({ seq: index + 1 }))

describe('replay preloading', () => {
  it('has no historical frames at the first event', () => {
    expect(replayPreloadBatches(points(1), 1)).toEqual([])
  })

  it('preloads the one historical frame', () => {
    expect(replayPreloadBatches(points(2), 2)).toEqual([[1]])
  })

  it('loads the whole ordinary replay from the current end in bounded batches', () => {
    expect(replayPreloadBatches(points(42), 42)).toEqual([
      Array.from({ length: 20 }, (_, index) => 41 - index),
      Array.from({ length: 20 }, (_, index) => 21 - index),
      [1],
    ])
  })

  it('preloads every historical frame for a long replay', () => {
    expect(replayPreloadBatches(points(300), 300).flat()).toEqual(Array.from({ length: 299 }, (_, index) => 299 - index))
  })
})
