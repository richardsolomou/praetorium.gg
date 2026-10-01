type Path = (string | number)[]
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export type ReplayChange = { path: Path; value: JsonValue } | { path: Path; remove: true } | { path: Path; length: number }

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function changesBetween(before: unknown, after: unknown, path: Path, changes: ReplayChange[]): void {
  if (Object.is(before, after)) return
  if (Array.isArray(before) && Array.isArray(after)) {
    for (let index = 0; index < Math.min(before.length, after.length); index++) {
      changesBetween(before[index], after[index], [...path, index], changes)
    }
    for (let index = before.length; index < after.length; index++)
      changes.push({ path: [...path, index], value: after[index] as JsonValue })
    if (after.length < before.length) changes.push({ path, length: after.length })
    return
  }
  if (record(before) && record(after)) {
    for (const key of Object.keys(before)) if (!Object.hasOwn(after, key)) changes.push({ path: [...path, key], remove: true })
    for (const key of Object.keys(after)) {
      if (Object.hasOwn(before, key)) changesBetween(before[key], after[key], [...path, key], changes)
      else changes.push({ path: [...path, key], value: after[key] as JsonValue })
    }
    return
  }
  changes.push({ path, value: after as JsonValue })
}

export function compactReplayFrames<T>(frames: readonly T[]): { first: T; deltas: ReplayChange[][] } {
  if (!frames.length) throw new Error('a replay batch needs a frame')
  const normalized = frames.map((frame) => JSON.parse(JSON.stringify(frame)) as JsonValue)
  const deltas: ReplayChange[][] = []
  for (let index = 1; index < normalized.length; index++) {
    const changes: ReplayChange[] = []
    changesBetween(normalized[index - 1], normalized[index], [], changes)
    deltas.push(changes)
  }
  return { first: normalized[0]! as T, deltas }
}

export function expandReplayFrames<T>(first: T, deltas: readonly (readonly ReplayChange[])[]): T[] {
  const frames = [first]
  for (const changes of deltas) {
    let frame: unknown = structuredClone(frames.at(-1))
    for (const change of changes) {
      if (!change.path.length) {
        if (!('value' in change)) throw new Error('invalid replay frame change')
        frame = change.value
        continue
      }
      let parent = frame as Record<string | number, unknown>
      for (const key of change.path.slice(0, -1)) parent = parent[key] as Record<string | number, unknown>
      const key = change.path.at(-1)!
      if ('remove' in change) delete parent[key]
      else if ('length' in change) (parent[key] as unknown[]).length = change.length
      else Object.defineProperty(parent, key, { value: change.value, writable: true, enumerable: true, configurable: true })
    }
    frames.push(frame as T)
  }
  return frames
}
