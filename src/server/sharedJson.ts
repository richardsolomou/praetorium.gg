import fs from 'node:fs'
import { createHash } from 'node:crypto'

/** Values parsed from each file content that something still holds, keyed by that content's hash. */
const parsedFiles = new Map<string, WeakRef<object>>()

/**
 * Reads a JSON file keeping one copy of each repeated string value.
 *
 * `JSON.parse` allocates every occurrence of a value separately, and catalogue sources repeat the same ids, scopes and
 * names hundreds of thousands of times, so those copies would dominate a loaded catalogue's heap. Pass the same
 * `strings` to every file of one load so the files share them too.
 *
 * Rules versions retain many byte-identical files, so a read returns the value already parsed from the same content
 * while anything still holds it. Treat the result as read-only.
 */
export function readSharedJson(file: string, strings = new Map<string, string>()): unknown {
  return parseSharedJson(fs.readFileSync(file, 'utf8'), strings)
}

export function parseSharedJson(content: string, strings = new Map<string, string>()): unknown {
  const key = createHash('sha256').update(content).digest('base64')
  const kept = parsedFiles.get(key)?.deref()
  if (kept) return kept
  const value = shareStrings(JSON.parse(content), strings)
  if (value && typeof value === 'object') parsedFiles.set(key, new WeakRef(value))
  return value
}

function shared(value: string, strings: Map<string, string>) {
  const kept = strings.get(value)
  if (kept !== undefined) return kept
  strings.set(value, value)
  return value
}

/** Replaces string values in a freshly parsed value, in place. */
function shareStrings(value: unknown, strings: Map<string, string>): unknown {
  if (typeof value === 'string') return shared(value, strings)
  if (Array.isArray(value)) {
    for (let at = 0; at < value.length; at++) {
      const item: unknown = value[at]
      if (typeof item === 'string') value[at] = shared(item, strings)
      else shareStrings(item, strings)
    }
  } else if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of Object.keys(record)) {
      const item = record[key]
      if (typeof item === 'string') record[key] = shared(item, strings)
      else shareStrings(item, strings)
    }
  }
  return value
}
