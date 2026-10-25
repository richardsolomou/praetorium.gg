import { useQuery } from '@tanstack/react-query'
import { useEffect, useSyncExternalStore } from 'react'
import { transformed } from '../shared/datacards'
import {
  TEXT_HASH_LENGTH,
  type TextSource,
  type TextSourceFile,
  type TextToken,
  hasTextTokens,
  resolvedText,
  sourceStrings,
  textTokensIn,
  withoutText,
} from '../shared/sourceText'
import { textSources } from './functions'
import { referenceQuery } from './queries/shared'
import { type TextSourceChoice, hex, reportTextLoadFailure, textSourceChoice, upstreamBytes, useTextSourceChoice } from './rulesText'

const encoder = new TextEncoder()
/** Digests run concurrently in batches: one at a time is slow, and every string of a large file at once holds them all in memory. */
const BATCH = 512

/** Every string a pinned upstream file holds, by the truncated hash a token names it by. */
async function loadSourceStrings(url: string): Promise<ReadonlyMap<string, string>> {
  // The file is not compared whole: each string answers only a token naming its own hash.
  // It must still parse, or the device would keep the broken answer and serve it on every visit.
  let file: unknown
  await upstreamBytes(url, async (response) => {
    const bytes = await response.arrayBuffer()
    try {
      file = JSON.parse(new TextDecoder().decode(bytes))
      return bytes
    } catch {
      return null
    }
  })
  const strings = [...sourceStrings(file)]
  const byHash = new Map<string, string>()
  for (let at = 0; at < strings.length; at += BATCH) {
    const batch = strings.slice(at, at + BATCH)
    const digests = await Promise.all(batch.map((value) => crypto.subtle.digest('SHA-256', encoder.encode(value))))
    batch.forEach((value, index) => byHash.set(hex(digests[index]!).slice(0, TEXT_HASH_LENGTH), value))
  }
  return byHash
}

/** Read from the downloaded reference while it is current, so a device can load text it reached offline. */
const textSourcesQuery = () => referenceQuery(['text-sources'], () => textSources())

/**
 * The upstream files this page has loaded, shared by every component and read outside
 * React too: the simulator compiles rules from their words wherever it runs.
 */
const urls = new Map<string, string>()
const sourceOf = new Map<string, TextSource>()
const files = new Map<string, { strings?: ReadonlyMap<string, string>; failed?: true }>()
const listeners = new Set<() => void>()
let version = 0
const changed = () => {
  version += 1
  for (const listener of listeners) listener()
}

/**
 * Starts loading one file, once per page; every reader of the store renders again when it lands.
 * A failure stays until the reader retries, so rows mounting as a list scrolls cannot repeat it.
 */
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
    (error: unknown) => {
      files.set(url, { failed: true })
      reportTextLoadFailure(sourceOf.get(id), error)
      changed()
    },
  )
  loading.set(url, loaded)
  return loaded
}
const loading = new Map<string, Promise<void>>()

/** Asks again for every file whose load failed. */
export async function retryFailedTextFiles() {
  const retries = [...urls].flatMap(([id, url]) => {
    if (!files.get(url)?.failed) return []
    loading.delete(url)
    return [loadTextFile(id)]
  })
  await Promise.all(retries)
}

/** Where each file a token names lives upstream, and its source, as the server lists them. */
export function registerTextSources(table: Readonly<Record<string, TextSourceFile>>) {
  let added = false
  for (const [id, { url, source }] of Object.entries(table)) {
    if (urls.get(id) === url) continue
    urls.set(id, url)
    sourceOf.set(id, source)
    added = true
  }
  if (added) changed()
}

/** What stands in for text this device has not chosen to load, is still loading, could not load, or cannot find. */
export type MissingText = 'unchosen' | 'loading' | 'failed' | 'unavailable' | null
/** Text as this device can show it. */
type LoadedText = { text: string; missing: MissingText }

/**
 * The sources a text's tokens need that this device has not chosen: the one authority for
 * whether a token's words may load. Null while the file list that says so is not here yet.
 */
function unchosenSources(tokens: readonly TextToken[], choice: TextSourceChoice): TextSource[] | null {
  if (urls.size === 0) return null
  const needs = new Set<TextSource>()
  for (const { file } of tokens) {
    const source = sourceOf.get(file)
    if (source && !choice.sources.has(source)) needs.add(source)
  }
  return [...needs]
}

const lookup = ({ file, transform, hash }: TextToken) => {
  const url = urls.get(file)
  const raw = url ? files.get(url)?.strings?.get(hash) : undefined
  return raw === undefined ? null : transformed(raw, transform)
}

/** Text as this device can show it now, and the reason any token in it is still missing. */
export function loadedText(text: string, choice = textSourceChoice()): LoadedText {
  if (!hasTextTokens(text)) return { text, missing: null }
  const tokens = textTokensIn(text)
  const needs = unchosenSources(tokens, choice)
  if (needs === null ? choice.sources.size === 0 : needs.length > 0) return { text: withoutText(text), missing: 'unchosen' }
  const waiting = tokens.some(({ file }) => {
    const url = urls.get(file)
    if (!url) return urls.size === 0
    const loaded = files.get(url)
    return !loaded?.strings && !loaded?.failed
  })
  if (waiting) return { text: withoutText(text), missing: 'loading' }
  const failed = tokens.some(({ file }) => {
    const url = urls.get(file)
    return url !== undefined && files.get(url)?.failed === true
  })
  if (failed) return { text: withoutText(text), missing: 'failed' }
  return {
    text: resolvedText(text, lookup, () => '—'),
    missing: tokens.some((token) => lookup(token) === null) ? 'unavailable' : null,
  }
}

/** A text's words once every token in it has loaded, or null: for rules that must not be read from part of a text. */
export function loadedWords(text: string, choice = textSourceChoice()) {
  const loaded = loadedText(text, choice)
  return loaded.missing === null ? loaded.text : null
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Loads the files these texts name from the sources the reader has chosen, and renders
 * again as each arrives; read the texts through `loadedText` or `loadedWords`. The file
 * list loads either way, since it is what names the source a missing text would come from.
 */
export function useSourceTexts(texts: readonly (string | null | undefined)[]) {
  const choice = useTextSourceChoice()
  const ids = [...new Set(texts.flatMap((text) => (text && hasTextTokens(text) ? textTokensIn(text).map((token) => token.file) : [])))]
  const { data: table } = useQuery({ ...textSourcesQuery(), enabled: ids.length > 0 })
  const wanted = ids.join(',')
  useEffect(() => {
    if (!table) return
    registerTextSources(table)
    for (const id of wanted.split(',')) {
      const source = table[id]?.source
      if (source && choice.sources.has(source)) void loadTextFile(id)
    }
  }, [table, choice, wanted])
  const loaded = useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  )
  // `loaded` changes as files arrive, so work memoized on it reads the newest words.
  return { choice, loaded }
}

/** One text as this device can show it, loading what it names when the reader has chosen to. */
export function useSourceText(text: string): LoadedText {
  const { choice } = useSourceTexts([text])
  return loadedText(text, choice)
}
