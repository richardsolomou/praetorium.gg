import { useQuery } from '@tanstack/react-query'
import type { RuleDocument, RuleTextSource } from '../contracts/rules'
import { ruleDocumentFrom } from '../shared/ruleDocuments'
import { useStoredValue, writeStoredValue } from './storedValue'

/** The only source a reader can choose today; kept as a value so another can join it. */
export const GAME_DATACARDS = 'game-datacards'

const KEY = 'praetorium-rules-text'
/** Pinned files never change, so a verified copy serves every later visit, offline too. */
const CACHE = 'praetorium-rules-text-v1'

export const useRulesTextChoice = () => useStoredValue(KEY) === GAME_DATACARDS
export const chooseRulesText = (load: boolean) => writeStoredValue(KEY, load ? GAME_DATACARDS : null)

const hex = (digest: ArrayBuffer) => Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')

async function verified(response: Response, text: RuleTextSource) {
  const bytes = await response.arrayBuffer()
  return hex(await crypto.subtle.digest('SHA-256', bytes)) === text.sha256 ? bytes : null
}

async function sourceBytes(text: RuleTextSource) {
  const cache = 'caches' in globalThis ? await caches.open(CACHE).catch(() => null) : null
  const kept = await cache?.match(text.url)
  const keptBytes = kept ? await verified(kept, text) : null
  if (keptBytes) return keptBytes
  const response = await fetch(text.url, { credentials: 'omit', referrerPolicy: 'no-referrer' })
  if (!response.ok) throw new Error(`Game Datacards answered ${response.status}`)
  const bytes = await verified(response, text)
  if (!bytes) throw new Error('The Game Datacards file does not match the pinned version')
  await cache?.put(text.url, new Response(bytes, { headers: { 'Content-Type': 'application/json' } })).catch(() => undefined)
  return bytes
}

/** The full document read from its pinned upstream file, refused unless it is the exact file the outline was built from. */
export async function loadRuleText(text: RuleTextSource): Promise<RuleDocument> {
  const document = ruleDocumentFrom(JSON.parse(new TextDecoder().decode(await sourceBytes(text))), text)
  if (!document) throw new Error('The Game Datacards file is not a rules document')
  return document
}

/** The document's text when this device has chosen to load it, and where that choice stands. */
export function useRuleText(text: RuleTextSource | null) {
  const chosen = useRulesTextChoice()
  const query = useQuery({
    queryKey: ['rules-text', text?.sha256],
    queryFn: () => (text ? loadRuleText(text) : Promise.reject(new Error('This document has no rules text'))),
    enabled: chosen && Boolean(text),
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  })
  // A copy loaded before the reader stopped loading stays cached, so the choice decides what shows.
  return { chosen, query, document: chosen ? (query.data ?? null) : null }
}
