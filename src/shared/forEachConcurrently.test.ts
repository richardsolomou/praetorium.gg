import { describe, expect, it } from 'vitest'
import { forEachConcurrently } from './forEachConcurrently'

describe('forEachConcurrently', () => {
  it('starts no task after one fails', async () => {
    const started: number[] = []
    await forEachConcurrently([0, 1, 2, 3], 2, async (item) => {
      started.push(item)
      if (item === 0) throw new Error('failed')
      await new Promise((resolve) => setTimeout(resolve, 5))
    }).catch(() => {})
    expect(started).toEqual([0, 1])
  })

  it('throws only once the tasks already running have settled', async () => {
    const failure = new Error('failed')
    const settled: number[] = []
    await expect(
      forEachConcurrently([0, 1], 2, async (item) => {
        if (item === 0) throw failure
        await new Promise((resolve) => setTimeout(resolve, 5))
        settled.push(item)
      }),
    ).rejects.toBe(failure)
    expect(settled).toEqual([1])
  })
})
