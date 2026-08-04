export type PresentPlayer = { playerId: string; name: string }

type Watcher = { playerId: string; name: string; streams: number }

/**
 * Who has a battle open right now.
 *
 * Presence is the live state of the open event streams, so it is held in memory
 * and never in SQLite: a row would outlive the tab it describes. Arriving and
 * leaving _is_ a stream opening and closing, which is why there are no
 * heartbeats and nothing to expire. Counted per stream, so a second tab does not
 * remove you when you close the first.
 */
export class Presence {
  private battles = new Map<string, Map<string, Watcher>>()
  private listeners = new Map<string, Set<(present: PresentPlayer[]) => void>>()

  /** Marks someone present until the returned function is called. */
  arrive(battleId: string, player: { playerId: string; name: string }, listener?: (present: PresentPlayer[]) => void) {
    const watchers = this.battles.get(battleId) ?? new Map<string, Watcher>()
    const existing = watchers.get(player.playerId)
    watchers.set(player.playerId, { ...player, streams: (existing?.streams ?? 0) + 1 })
    this.battles.set(battleId, watchers)

    if (listener) {
      const listeners = this.listeners.get(battleId) ?? new Set<(present: PresentPlayer[]) => void>()
      listeners.add(listener)
      this.listeners.set(battleId, listeners)
    }
    this.announce(battleId)

    let left = false
    return () => {
      if (left) return
      left = true
      if (listener) {
        const listeners = this.listeners.get(battleId)
        listeners?.delete(listener)
        if (!listeners?.size) this.listeners.delete(battleId)
      }
      const active = this.battles.get(battleId)
      const watcher = active?.get(player.playerId)
      if (watcher && watcher.streams > 1) watcher.streams--
      else active?.delete(player.playerId)
      if (!active?.size) this.battles.delete(battleId)
      this.announce(battleId)
    }
  }

  present(battleId: string): PresentPlayer[] {
    return [...(this.battles.get(battleId)?.values() ?? [])]
      .map((watcher) => ({ playerId: watcher.playerId, name: watcher.name }))
      .toSorted((left, right) => left.name.localeCompare(right.name) || left.playerId.localeCompare(right.playerId))
  }

  private announce(battleId: string) {
    const present = this.present(battleId)
    for (const listener of this.listeners.get(battleId) ?? []) listener(present)
  }
}
