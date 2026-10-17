import { useQuery } from '@tanstack/react-query'
import { useEffect, useSyncExternalStore } from 'react'
import { transformed } from '../shared/datacards'
import {
  TEXT_HASH_LENGTH,
  type TextToken,
  hasTextTokens,
  resolvedText,
  sourceStrings,
  textTokensIn,
  withoutText,
} from '../shared/sourceText'
import { textSources } from '../server/functions/references'
import { referenceQuery } from './queries/shared'
import { rulesTextChosen, upstreamBytes, useRulesTextChoice } from './rulesText'

const hex = (digest: ArrayBuffer) => Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
const encoder = new TextEncoder()
/** Digests run concurrently in batches: one at a time is slow, and every string of a large file at once holds them all in memory. */
const BATCH = 512

/** Every string a pinned upstream file holds, by the truncated hash a token names it by. */
export async function loadSourceStrings(url: string): Promise<ReadonlyMap<string, string>> {
  // The file is not compared whole: each string answers only a token naming its own hash.
  const bytes = await upstreamBytes(url, (response) => response.arrayBuffer())
  const strings = [...sourceStrings(JSON.parse(new TextDecoder().decode(bytes)))]
  const byHash = new Map<string, string>()
  for (let at = 0; at < strings.length; at += BATCH) {
    const batch = strings.slice(at, at + BATCH)
    const digests = await Promise.all(batch.map((value) => crypto.subtle.digest('SHA-256', encoder.encode(value))))
    batch.forEach((value, index) => byHash.set(hex(digests[index]!).slice(0, TEXT_HASH_LENGTH), value))
  }
  return byHash
}

/** Read from the downloaded reference while it is current, so a device can load text it reached offline. */
export const textSourcesQuery = () => referenceQuery(['text-sources'], () => textSources())

/**
 * The upstream files this page has loaded, shared by every component and read outside
 * React too: the simulator compiles rules from their words wherever it runs.
 */
const urls = new Map<string, string>()
const files = new Map<string, { strings?: ReadonlyMap<string, string>; failed?: true }>()
const listeners = new Set<() => void>()
let version = 0
const changed = () => {
  version += 1
  for (const listener of listeners) listener()
}

/** Starts loading one file, once per page; every reader of the store renders again when it lands. */
export function loadTextFile(id: string): Promise<void> {
  const url = urls.get(id)
  if (!url) return Promise.resolve()
  const pending = loading.get(url)
  if (pending) return pending
  files.set(url, {})
  const loaded = loadSourceStrings(url).then(
    (strings) => {
      files.set(url, { strings })
      changed()
    },
    () => {
      files.set(url, { failed: true })
      changed()
    },
  )
  loading.set(url, loaded)
  return loaded
}
const loading = new Map<string, Promise<void>>()

/** Where each file a token names lives upstream, as the server lists them. */
export function registerTextSources(table: Readonly<Record<string, string>>) {
  let added = false
  for (const [id, url] of Object.entries(table)) {
    if (urls.get(id) === url) continue
    urls.set(id, url)
    added = true
  }
  if (added) changed()
}

/** What stands in for text this device has not chosen to load, is still loading, or cannot find. */
export type MissingText = 'unchosen' | 'loading' | 'unavailable' | null

const lookup = ({ file, transform, hash }: TextToken) => {
  const url = urls.get(file)
  const raw = url ? files.get(url)?.strings?.get(hash) : undefined
  return raw === undefined ? null : transformed(raw, transform)
}

/** Text as this device can show it now, and the reason any token in it is still missing. */
export function loadedText(text: string, chosen = rulesTextChosen()): { text: string; missing: MissingText } {
  if (!hasTextTokens(text)) return { text, missing: null }
  if (!chosen) return { text: withoutText(text), missing: 'unchosen' }
  const tokens = textTokensIn(text)
  const waiting = tokens.some(({ file }) => {
    const url = urls.get(file)
    if (!url) return urls.size === 0
    const loaded = files.get(url)
    return !loaded?.strings && !loaded?.failed
  })
  if (waiting) return { text: withoutText(text), missing: 'loading' }
  return { text: resolvedText(text, lookup, () => '—'), missing: tokens.some((token) => lookup(token) === null) ? 'unavailable' : null }
}

/** A text's words once every token in it has loaded, or null: for rules that must not be read from part of a text. */
export function loadedWords(text: string, chosen = rulesTextChosen()) {
  const loaded = loadedText(text, chosen)
  return loaded.missing === null ? loaded.text : null
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Loads the files these texts name once the reader has chosen to load rules text, and
 * renders again as each arrives; read the texts through `loadedText` or `loadedWords`.
 */
export function useSourceTexts(texts: readonly (string | null | undefined)[]) {
  const chosen = useRulesTextChoice()
  const ids = [...new Set(texts.flatMap((text) => (text && hasTextTokens(text) ? textTokensIn(text).map((token) => token.file) : [])))]
  const { data: table } = useQuery({ ...textSourcesQuery(), enabled: chosen && ids.length > 0 })
  const wanted = ids.join(',')
  useEffect(() => {
    if (!table) return
    registerTextSources(table)
    if (chosen) for (const id of wanted.split(',')) void loadTextFile(id)
  }, [table, chosen, wanted])
  const loaded = useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  )
  // `loaded` changes as files arrive, so work memoized on it reads the newest words.
  return { chosen, loaded }
}

/** One text as this device can show it, loading what it names when the reader has chosen to. */
export function useSourceText(text: string): { text: string; missing: MissingText } {
  const { chosen } = useSourceTexts([text])
  return loadedText(text, chosen)
}
