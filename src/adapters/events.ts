import { CentrifugoPublisher } from 'ras-stack/realtime'
import { battleChannel, userChannel } from './realtime'

export type BattleEvents = {
  /**
   * `seated` is told the list of battles moved, whether or not they have this one open.
   * `seq` is the log's new high-water mark when one command caused this, so a client
   * already holding that history can skip refetching the screen it just wrote.
   */
  publish: (battleId: string, seated?: readonly string[], seq?: number) => void
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

  publish(battleId: string, seated: readonly string[] = [], seq?: number) {
    this.publisher?.publish(battleChannel(battleId), seq === undefined ? { changed: battleId } : { changed: battleId, seq })
    for (const userId of seated) this.publisher?.publish(userChannel(userId), { changed: battleId })
  }
}
