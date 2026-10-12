import type { CombatAnswer, CombatRequest } from '../core/combatMatchup'

export class CombatAnswerCache {
  private entries = new Map<string, { answer: CombatAnswer; bytes: number }>()
  private bytes = 0

  constructor(
    private readonly maxBytes: number,
    private readonly maxEntries = 2048,
  ) {}

  read(request: CombatRequest) {
    const key = JSON.stringify(request)
    const entry = this.entries.get(key)
    if (!entry) return undefined
    this.entries.delete(key)
    this.entries.set(key, entry)
    return structuredClone(entry.answer)
  }

  write(request: CombatRequest, answer: CombatAnswer) {
    if ([answer.ranged, answer.melee, answer.combined].some((phase) => phase?.error)) return
    const key = JSON.stringify(request)
    const size = (key.length + JSON.stringify(answer).length) * 2
    if (size > this.maxBytes) return
    const previous = this.entries.get(key)
    if (previous) this.bytes -= previous.bytes
    this.entries.delete(key)
    this.entries.set(key, { answer: structuredClone(answer), bytes: size })
    this.bytes += size
    while (this.bytes > this.maxBytes || this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value!
      this.bytes -= this.entries.get(oldest)!.bytes
      this.entries.delete(oldest)
    }
  }

  clear() {
    this.entries.clear()
    this.bytes = 0
  }
}
