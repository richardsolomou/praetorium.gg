import { EventEmitter } from 'node:events'

/** Somewhere to say "this battle changed" so open pages can refetch. */
export type BattleEvents = {
  publish: (battleId: string) => void
  subscribe: (battleId: string, listener: () => void) => () => void
}

/**
 * In-process fan-out. An event carries a battle id and nothing else: a listener
 * is told to refetch, and the refetch goes through `battleView` like any other
 * read, so the stream can never be the thing that leaks a hidden card.
 *
 * One process serves one SQLite file, so there is nothing to distribute.
 */
export function createBattleEvents(): BattleEvents {
  const emitter = new EventEmitter()
  // One listener per open tab, and `StreamLimiter` is what bounds those.
  emitter.setMaxListeners(0)

  return {
    publish: (battleId) => {
      emitter.emit('change', battleId)
    },
    subscribe: (battleId, listener) => {
      const handler = (changed: string) => {
        if (changed === battleId) listener()
      }
      emitter.on('change', handler)
      return () => emitter.off('change', handler)
    },
  }
}
