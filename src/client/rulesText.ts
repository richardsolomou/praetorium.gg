import { useQuery } from '@tanstack/react-query'
import { posthog } from 'posthog-js'
import { useEffect } from 'react'
import type { RuleDocument, RuleTextSource } from '../contracts/rules'
import { ruleDocumentFrom } from '../shared/ruleDocuments'
import { toggled } from '../core/collections'
import { TEXT_SOURCES, type TextSource } from '../shared/sourceText'
import { isFetchNetworkFailure } from './networkErrors'
import { readStoredValue, subscribeStoredValues, useStoredValue, writeStoredValue } from './storedValue'
import { rulesTextKey } from './queries/queryKeys'
import { hex } from './sourceStrings'

/**
 * The sources this device loads rules text from, kept as their names in order. An empty
 * value is a decision to load none; no value at all means the reader has not decided yet.
 */
const KEY = 'praetorium-text-sources'
/** Pinned files never change, so a verified copy serves every later visit, offline too. */
const CACHE = 'praetorium-rules-text-v1'

/** Every source this browser can fetch rules text from; the dialog and the data sources page list exactly these. */
export const TEXT_SOURCE_INFO: Record<TextSource, { name: string; repository: string; provides: string; licence: string }> = {
  bsdata: {
    name: 'BSData',
    repository: 'https://github.com/BSData/wh40k-11e',
    provides: 'Ability, wargear, and enhancement text from the faction catalogues.',
    licence: 'No licence stated.',
  },
  'game-datacards': {
    name: 'Game Datacards',
    repository: 'https://github.com/game-datacards/datasources',
    provides: 'Core rules, stratagems, detachment rules, and mission text.',
    licence: 'No licence stated.',
  },
}

export type TextSourceChoice = { decided: boolean; sources: ReadonlySet<TextSource> }

const choices = new Map<string | null, TextSourceChoice>()
/** One object per stored value, so a choice can be compared and memoized on. */
export function textSourceChoiceFrom(stored: string | null): TextSourceChoice {
  let choice = choices.get(stored)
  if (!choice) {
    const named = new Set(stored?.split(','))
    choice = { decided: stored !== null, sources: new Set(TEXT_SOURCES.filter((source) => named.has(source))) }
    choices.set(stored, choice)
  }
  return choice
}

/**
 * Runs in the document head before the first paint and puts the stored choice on the document
 * as `data-text-sources`, absent while undecided, so styles draw the reader's own state before
 * React reads storage. It parses the value as `textSourceChoiceFrom` does.
 */
export const TEXT_SOURCES_SCRIPT = `try{var v=localStorage.getItem(${JSON.stringify(KEY)});if(v!==null)document.documentElement.dataset.textSources=v.split(',').filter(function(s){return ${JSON.stringify(TEXT_SOURCES)}.indexOf(s)>=0}).join(' ')}catch(e){}`

/** Puts a choice on the document as the head script does. */
export function applyTextSourceChoice(choice: TextSourceChoice) {
  const root = document.documentElement
  if (choice.decided) root.dataset.textSources = TEXT_SOURCES.filter((source) => choice.sources.has(source)).join(' ')
  else delete root.dataset.textSources
}

/** Keeps the document on the stored choice as it changes, and sets it where the head script never ran. */
export function followTextSourceChoice() {
  const apply = () => applyTextSourceChoice(textSourceChoice())
  apply()
  return subscribeStoredValues(apply)
}

/** Undecided on the server and while hydrating, like every stored value. */
export const useTextSourceChoice = () => textSourceChoiceFrom(useStoredValue(KEY))
/** The choice outside React, for reads that run where no component renders. */
export const textSourceChoice = () => textSourceChoiceFrom(readStoredValue(KEY))

/** Records exactly these sources as the ones to load, none included, which also settles the question. */
export const chooseTextSources = (sources: Iterable<TextSource>) => {
  const chosen = new Set(sources)
  writeStoredValue(KEY, TEXT_SOURCES.filter((source) => chosen.has(source)).join(','))
}

export const chooseTextSource = (source: TextSource, load: boolean) => chooseTextSources(toggled(textSourceChoice().sources, source, load))

async function verified(response: Response, text: RuleTextSource) {
  const bytes = await response.arrayBuffer()
  return hex(await crypto.subtle.digest('SHA-256', bytes)) === text.sha256 ? bytes : null
}

/** An upstream answer that is not the pinned file, with only what telemetry may carry about it. */
class UpstreamTextError extends Error {
  constructor(
    message: string,
    readonly failure: TextLoadFailure,
  ) {
    super(message)
  }
}

type TextLoadFailure = { reason: 'network' | 'http' | 'mismatch' | 'invalid'; status?: number }

/** Why a rules text file did not load, never the error's message. */
export function textLoadFailure(error: unknown): TextLoadFailure {
  if (error instanceof UpstreamTextError) return error.failure
  return { reason: isFetchNetworkFailure(error) ? 'network' : 'invalid' }
}

export function reportTextLoadFailure(source: TextSource | undefined, error: unknown) {
  posthog.capture('rules_text_load_failed', { source, ...textLoadFailure(error) })
}

/**
 * A pinned upstream file's bytes, from this device's copy when it kept one that `accept`
 * still takes. A copy is kept only once accepted, so a refused answer is asked again.
 */
export async function upstreamBytes(url: string, accept: (response: Response) => Promise<ArrayBuffer | null>) {
  const cache = 'caches' in globalThis ? await caches.open(CACHE).catch(() => null) : null
  const kept = await cache?.match(url)
  const keptBytes = kept ? await accept(kept) : null
  if (keptBytes) return keptBytes
  const response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' })
  if (!response.ok) throw new UpstreamTextError(`The source answered ${response.status}`, { reason: 'http', status: response.status })
  const bytes = await accept(response)
  if (!bytes) throw new UpstreamTextError('The source file does not match the pinned version', { reason: 'mismatch' })
  await cache?.put(url, new Response(bytes, { headers: { 'Content-Type': 'application/json' } })).catch(() => undefined)
  return bytes
}

const sourceBytes = (text: RuleTextSource) => upstreamBytes(text.url, (response) => verified(response, text))

/** The full document read from its pinned upstream file, refused unless it is the exact file the outline was built from. */
export async function loadRuleText(text: RuleTextSource): Promise<RuleDocument> {
  const document = ruleDocumentFrom(JSON.parse(new TextDecoder().decode(await sourceBytes(text))), text)
  if (!document) throw new Error('The Game Datacards file is not a rules document')
  return document
}

/** The document's text when this device has chosen to load it, and where that choice stands. */
export function useRuleText(text: RuleTextSource | null) {
  // Rules documents are Game Datacards files.
  const chosen = useTextSourceChoice().sources.has('game-datacards')
  const query = useQuery({
    queryKey: rulesTextKey(text?.sha256),
    queryFn: () => (text ? loadRuleText(text) : Promise.reject(new Error('This document has no rules text'))),
    enabled: chosen && Boolean(text),
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  })
  useEffect(() => {
    if (query.error) reportTextLoadFailure('game-datacards', query.error)
  }, [query.error])
  // A copy loaded before the reader stopped loading stays cached, so the choice decides what shows.
  return { chosen, query, document: chosen ? (query.data ?? null) : null }
}
