import { z } from 'zod'
import { battleChannel } from '../server/realtime'

/** Somewhere to say "this battle changed" so open pages can refetch. */
export type BattleEvents = {
  publish: (battleId: string) => void
}

/**
 * Publishes to Centrifugo over its HTTP API.
 *
 * A message carries the battle id and nothing else. Every page that hears it
 * refetches through `battleView` like any other read, so the stream can never be
 * the thing that leaks a hidden card.
 *
 * A battle publishes at most one message at a time: a second change while one is
 * in flight marks the pending publish dirty and is sent when it lands, so a
 * player tapping repeatedly cannot queue a burst of identical nudges.
 */
export class RealtimePublisher implements BattleEvents {
  private pending = new Map<string, { dirty: boolean }>()

  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string | undefined,
    private readonly timeoutMs = 5_000,
    private readonly retryMs = 1_000,
  ) {}

  publish(battleId: string) {
    if (!this.apiKey) return
    const pending = this.pending.get(battleId)
    if (pending) {
      pending.dirty = true
      return
    }
    const state = { dirty: true }
    this.pending.set(battleId, state)
    void this.flush(battleId, state)
  }

  private async flush(battleId: string, state: { dirty: boolean }) {
    try {
      while (state.dirty) {
        state.dirty = false
        // eslint-disable-next-line no-await-in-loop
        await this.deliver(battleId)
      }
    } catch (error) {
      console.warn('realtime publish failed', error)
    } finally {
      if (this.pending.get(battleId) === state) this.pending.delete(battleId)
    }
  }

  /**
   * Retries anything that looks like the network rather than the message.
   *
   * A refused publish is a bug and is reported once; a connection that was not
   * there yet is a moment, and giving up on it would leave the other player's
   * screen stale until they touched it.
   */
  private async deliver(battleId: string): Promise<void> {
    for (;;) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await this.deliverOnce(battleId)
        return
      } catch (error) {
        if (!(error instanceof TransientPublishError)) throw error
        console.warn('retrying realtime publish', error)
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, this.retryMs))
      }
    }
  }

  private async deliverOnce(battleId: string) {
    let response: Response
    try {
      response = await fetch(`${this.apiUrl}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': this.apiKey! },
        body: JSON.stringify({ channel: battleChannel(battleId), data: { changed: battleId } }),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (error) {
      if (error instanceof TypeError || isTimeout(error))
        throw new TransientPublishError('realtime publish request failed', { cause: error })
      throw error
    }
    if (!response.ok) {
      if (response.status < 500 && response.status !== 429) throw new Error(`realtime publish failed with status ${response.status}`)
      throw new TransientPublishError(`realtime publish failed with status ${response.status}`)
    }
    // Centrifugo answers 200 with an error body, so the status alone says nothing.
    const result = PUBLISHED.parse(await response.json())
    if (result.error) {
      const message = result.error.message ?? `code ${result.error.code ?? 'unknown'}`
      // 100 is Centrifugo's internal error, which is the one worth trying again.
      if (result.error.code !== 100) throw new Error(`realtime publish failed: ${message}`)
      throw new TransientPublishError(`realtime publish failed: ${message}`)
    }
  }
}

class TransientPublishError extends Error {}

const isTimeout = (error: unknown) => error instanceof DOMException && error.name === 'TimeoutError'

const PUBLISHED = z.object({ error: z.object({ code: z.number().optional(), message: z.string().optional() }).optional() })

/** For tests and for an instance with no realtime configured: publishing goes nowhere. */
export const createBattleEvents = (): BattleEvents => ({ publish: () => {} })
