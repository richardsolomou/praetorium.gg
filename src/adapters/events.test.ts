import { describe, expect, it, vi } from 'vitest'
import { RealtimePublisher } from './events'

describe('RealtimePublisher', () => {
  it('publishes a content-free change notification to the battle channel', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ result: {} }))
    const events = new RealtimePublisher('http://centrifugo:8000/api', 'secret', request)

    events.publish('battle-id')

    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce())
    expect(request).toHaveBeenCalledWith('http://centrifugo:8000/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'secret' },
      body: JSON.stringify({ channel: 'battle:battle-id', data: { changed: 'battle-id' } }),
      signal: expect.any(AbortSignal),
    })
  })

  it('does nothing when realtime is not configured', () => {
    const request = vi.fn<typeof fetch>()
    const events = new RealtimePublisher('http://centrifugo:8000/api', undefined, request)

    events.publish('battle-id')

    expect(request).not.toHaveBeenCalled()
  })
})
