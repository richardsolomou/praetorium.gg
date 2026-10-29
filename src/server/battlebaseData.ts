import { z } from 'zod'
import type { BattlebaseNames } from '../core/battlebaseRoster'
import { fetchWithRetry } from './fetch'

/**
 * BattleBase ships its army data inside its web app's script chunks: the newest data and a
 * few earlier versions that still name what older rosters picked. Ids stay stable across
 * versions, so the names of every chunk together read rosters back to the start of the edition.
 */
const origin = () => process.env.BATTLEBASE_APP_URL || 'https://www.battlebase.app'
const HELD_MS = 24 * 60 * 60 * 1000

const named = z.object({ id: z.string(), name: z.string() })
const armyData = z.object({
  data: z.object({
    factions: z.array(named.extend({ alternativeName: z.string().nullish() })),
    datasheets: z.array(named),
    models: z.array(named),
    wargearItems: z.array(named),
    rosterUnitWargearEditSetWargearItems: z.array(z.object({ id: z.string(), wargearItemId: z.string() })),
    defaultModelWargearLoadouts: z.array(z.object({ id: z.string(), modelId: z.string(), datasheetId: z.string() })).default([]),
    defaultModelWargearLoadoutWargearSelections: z
      .array(z.object({ defaultModelLoadoutId: z.string(), wargearChoiceId: z.string(), count: z.number() }))
      .default([]),
    enhancements: z.array(named),
    detachments: z.array(named),
    forceDispositions: z.array(named),
    stratagems: z.array(z.object({ title: z.string() })),
  }),
})

let held: { until: number; names: Promise<BattlebaseNames> } | null = null

export function battlebaseNames(now = Date.now()) {
  if (held && held.until > now) return held.names
  const names = readNames()
  held = { until: now + HELD_MS, names }
  names.catch(() => {
    if (held?.names === names) held = null
  })
  return names
}

async function text(path: string) {
  const response = await fetchWithRetry(new URL(path, origin()), {}, { timeoutMs: 60_000 })
  if (!response.ok) throw new Response('BattleBase did not answer as expected. Try again later.', { status: 502 })
  return response.text()
}

async function readNames(): Promise<BattlebaseNames> {
  const page = await text('/')
  const main = /src="(\/static\/js\/main\.[\w]+\.js)"/.exec(page)?.[1]
  const chunks = main ? dataChunks(await text(main)) : []
  if (!chunks.length) throw new Response('BattleBase changed how it serves its army data, so lists cannot be read.', { status: 502 })
  const names: BattlebaseNames = {
    factions: {},
    datasheets: {},
    models: {},
    wargear: {},
    defaults: {},
    enhancements: {},
    detachments: {},
    forceDispositions: {},
    stratagems: [],
  }
  // Oldest first, so a name the newest data still carries is the one kept.
  for (const chunk of chunks) {
    for (const payload of jsonPayloads(await text(chunk))) {
      const parsed = armyData.safeParse(payload)
      if (!parsed.success) continue
      const data = parsed.data.data
      const items = new Map(data.wargearItems.map((item) => [item.id, item.name]))
      for (const faction of data.factions) names.factions[faction.id] = faction.alternativeName || faction.name
      for (const [table, rows] of [
        [names.datasheets, data.datasheets],
        [names.models, data.models],
        [names.enhancements, data.enhancements],
        [names.detachments, data.detachments],
        [names.forceDispositions, data.forceDispositions],
      ] as const)
        for (const row of rows) table[row.id] = row.name
      for (const choice of data.rosterUnitWargearEditSetWargearItems) {
        const item = items.get(choice.wargearItemId)
        if (item) names.wargear[choice.id] = item
      }
      const loadouts = new Map(data.defaultModelWargearLoadouts.map((loadout) => [loadout.id, `${loadout.datasheetId}/${loadout.modelId}`]))
      for (const selection of data.defaultModelWargearLoadoutWargearSelections) {
        const loadout = loadouts.get(selection.defaultModelLoadoutId)
        if (loadout) names.defaults[`${loadout}/${selection.wargearChoiceId}`] = selection.count
      }
      names.stratagems = [...new Set([...names.stratagems, ...data.stratagems.map((stratagem) => stratagem.title)])]
    }
  }
  if (!Object.keys(names.datasheets).length)
    throw new Response('BattleBase changed how it serves its army data, so lists cannot be read.', { status: 502 })
  return names
}

/** The chunk files the app names `root` or `rosterData-<date>`, oldest data first and the app's current data last. */
export function dataChunks(main: string): string[] {
  const map = /\{([^{}]*)\}\[e\]\|\|e\)\+"\."\+\{([^{}]*)\}\[e\]\+"\.chunk\.js"/.exec(main)
  if (!map) return []
  const pairs = (body: string) => new Map([...body.matchAll(/(\d+):"([^"]+)"/g)].map((match) => [match[1]!, match[2]!]))
  const names = pairs(map[1]!)
  const hashes = pairs(map[2]!)
  return [...names]
    .filter(([, name]) => name === 'root' || /^rosterData-\d+$/.test(name))
    .sort(([, left], [, right]) => (left === 'root' ? 1 : right === 'root' ? -1 : left.localeCompare(right)))
    .flatMap(([key, name]) => (hashes.has(key) ? [`/static/js/${name}.${hashes.get(key)}.chunk.js`] : []))
}

/** Every `JSON.parse('…')` argument in a script, decoded as data and never run. */
export function jsonPayloads(script: string): unknown[] {
  const found: unknown[] = []
  for (let at = script.indexOf("JSON.parse('"); at !== -1; at = script.indexOf("JSON.parse('", at + 1)) {
    const literal = singleQuoted(script, at + "JSON.parse('".length)
    if (literal === null) continue
    try {
      found.push(JSON.parse(literal))
    } catch {
      // A payload that is not JSON is some other script's, not army data.
    }
  }
  return found
}

const ESCAPES: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0' }

/** A single-quoted JavaScript string's value, read from just after its opening quote. */
function singleQuoted(script: string, start: number): string | null {
  let value = ''
  for (let at = start; at < script.length; at++) {
    const char = script[at]!
    if (char === "'") return value
    if (char !== '\\') {
      value += char
      continue
    }
    const next = script[++at]
    if (next === undefined) return null
    if (next === 'x') {
      value += String.fromCharCode(Number.parseInt(script.slice(at + 1, at + 3), 16))
      at += 2
    } else if (next === 'u' && script[at + 1] === '{') {
      const end = script.indexOf('}', at)
      value += String.fromCodePoint(Number.parseInt(script.slice(at + 2, end), 16))
      at = end
    } else if (next === 'u') {
      value += String.fromCharCode(Number.parseInt(script.slice(at + 1, at + 5), 16))
      at += 4
    } else if (next === '\n') continue
    else value += ESCAPES[next] ?? next
  }
  return null
}
