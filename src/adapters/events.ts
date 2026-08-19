import { CentrifugoPublisher } from 'ras-stack/realtime'
import { battleChannel, userChannel } from './realtime'

export type BattleEvents = {
  /** `seated` is told the list of battles moved, whether or not they have this one open. */
  publish: (battleId: string, seated?: readonly string[]) => void
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

  publish(battleId: string, seated: readonly string[] = []) {
    this.publisher?.publish(battleChannel(battleId), { changed: battleId })
    for (const userId of seated) this.publisher?.publish(userChannel(userId), { changed: battleId })
  }
}
