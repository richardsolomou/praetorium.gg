import { CentrifugoPublisher } from 'ras-stack/realtime'
import { battleChannel } from './realtime'

export type BattleEvents = {
  publish: (battleId: string) => void
}

export class RealtimePublisher implements BattleEvents {
  private readonly publisher: CentrifugoPublisher | undefined

  constructor(apiUrl: string, apiKey: string | undefined, request: typeof fetch = fetch) {
    if (!apiKey) return
    this.publisher = new CentrifugoPublisher({
      apiUrl,
      apiKey,
      fetch: request,
      onError: (error, channel) => console.warn('realtime publish failed', { channel, error }),
      onRetry: (error, channel) => console.warn('retrying realtime publish', { channel, error }),
    })
  }

  publish(battleId: string) {
    this.publisher?.publish(battleChannel(battleId), { changed: battleId })
  }
}
