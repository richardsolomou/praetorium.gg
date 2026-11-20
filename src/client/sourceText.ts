import { useEffect, useSyncExternalStore } from 'react'
import { comparableText, hasTextTokens, resolvedText, textTokensIn, withoutText, type TextToken } from '../core/sourceText'
import { ruleSummaries } from './functions'
import { referenceRead } from './offline/runtime'

type Summaries = Readonly<Record<string, string>>
const files = new Map<string, Summaries | 'loading' | 'failed'>()
const listeners = new Set<() => void>()
let version = 0

function setFile(id: string, value: Summaries | 'loading' | 'failed') {
  files.set(id, value)
  version += 1
  for (const listener of listeners) listener()
}

async function load(id: string) {
  if (files.has(id)) return
  setFile(id, 'loading')
  return referenceRead(['rule-summaries', id], () => ruleSummaries({ data: id })).then(
    (summaries) => setFile(id, summaries),
    () => setFile(id, 'failed'),
  )
}

export async function retryFailedTextFiles() {
  await Promise.all(
    [...files].flatMap(([id, state]) => {
      if (state !== 'failed') return []
      files.delete(id)
      return [load(id)]
    }),
  )
}

export type MissingText = 'loading' | 'failed' | 'unavailable' | null

function summaryOf(token: TextToken) {
  if (!wholeText(token)) return null
  const file = files.get(token.file)
  return typeof file === 'object' ? (file[token.hash] ?? null) : null
}

function wholeText({ transform }: TextToken) {
  return transform === 'plain' || transform === 'prose' || transform === 'trim'
}

export function loadedText(text: string): { text: string; missing: MissingText } {
  if (!hasTextTokens(text)) return { text, missing: null }
  const all = textTokensIn(text)
  const tokens = all.filter(wholeText)
  if (tokens.some(({ file }) => files.get(file) === 'failed')) return { text: withoutText(text), missing: 'failed' }
  if (tokens.some(({ file }) => !files.has(file) || files.get(file) === 'loading')) return { text: withoutText(text), missing: 'loading' }
  const id = tokens[0]?.file
  const compound = id && tokens.every(({ file }) => file === id) ? files.get(id) : undefined
  const summary = typeof compound === 'object' ? compound[comparableText(text)] : undefined
  if (summary) return { text: summary, missing: null }
  const complete = all.every((token) => summaryOf(token) !== null)
  return complete ? { text: resolvedText(text, summaryOf, () => ''), missing: null } : { text: withoutText(text), missing: 'unavailable' }
}

/** For display only. Legal and scoring checks use their recorded facts. */
export function displayedWords(text: string) {
  const loaded = loadedText(text)
  return loaded.missing === null ? loaded.text : null
}

export function textGap(texts: readonly (string | null | undefined)[]) {
  const gaps = new Set(texts.flatMap((text) => (text ? [loadedText(text).missing] : [])))
  return (['failed', 'loading', 'unavailable'] as const).find((gap) => gaps.has(gap)) ?? null
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSourceTexts(texts: readonly (string | null | undefined)[]) {
  const requested = [
    ...new Set(
      texts.flatMap((text) =>
        text
          ? textTokensIn(text)
              .filter(wholeText)
              .map(({ file }) => file)
          : [],
      ),
    ),
  ].join(',')
  useEffect(() => {
    if (requested) for (const id of requested.split(',')) void load(id)
  }, [requested])
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  )
}

export function useSourceText(text: string) {
  useSourceTexts([text])
  return loadedText(text)
}
