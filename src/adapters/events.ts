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
      // A nudge that never lands costs freshness and nothing else: the page
      // refetches when it next acts, and its own answer carries the new state.
      console.warn('realtime publish failed', error)
    } finally {
      if (this.pending.get(battleId) === state) this.pending.delete(battleId)
    }
  }

  private async deliver(battleId: string) {
    const response = await fetch(`${this.apiUrl}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': this.apiKey! },
      body: JSON.stringify({ channel: battleChannel(battleId), data: { changed: battleId } }),
      signal: AbortSignal.timeout(this.timeoutMs),
    })
    if (!response.ok) throw new Error(`realtime publish failed with status ${response.status}`)
    // Centrifugo answers 200 with an error body, so the status alone says nothing.
    const result = PUBLISHED.parse(await response.json())
    if (result.error) throw new Error(`realtime publish failed: ${result.error.message ?? result.error.code}`)
  }
}

const PUBLISHED = z.object({ error: z.object({ code: z.number().optional(), message: z.string().optional() }).optional() })

/** For tests and for an instance with no realtime configured: publishing goes nowhere. */
export const createBattleEvents = (): BattleEvents => ({ publish: () => {} })
