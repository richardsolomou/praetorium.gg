/**
 * A least-recently-used cache bounded by entry count and by an estimate of its UTF-16
 * size. Values are cloned in and out so no caller can change what another reads.
 */
export class BoundedCache<K, V> {
  private entries = new Map<string, { value: V; bytes: number }>()
  private bytes = 0

  constructor(
    private readonly maxBytes: number,
    private readonly maxEntries: number,
    private readonly keyOf: (key: K) => string,
  ) {}

  get size() {
    return this.entries.size
  }

  read(key: K) {
    const id = this.keyOf(key)
    const entry = this.entries.get(id)
    if (!entry) return undefined
    this.entries.delete(id)
    this.entries.set(id, entry)
    return structuredClone(entry.value)
  }

  write(key: K, value: V) {
    const id = this.keyOf(key)
    const size = (id.length + JSON.stringify(value).length) * 2
    if (size > this.maxBytes) return
    const previous = this.entries.get(id)
    if (previous) this.bytes -= previous.bytes
    this.entries.delete(id)
    this.entries.set(id, { value: structuredClone(value), bytes: size })
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
