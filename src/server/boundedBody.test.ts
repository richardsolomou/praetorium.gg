import { describe, expect, it } from 'vitest'
import { boundedBytes } from './boundedBody'

const streamed = (...chunks: number[]) =>
  new Response(
    new ReadableStream({
      start(controller) {
        for (const size of chunks) controller.enqueue(new Uint8Array(size))
        controller.close()
      },
    }),
  )

describe('boundedBytes', () => {
  it('refuses a body that grows past the limit without declaring its length', async () => {
    await expect(boundedBytes(streamed(4, 4), 6, 'too large')).rejects.toThrow('too large')
  })
})
