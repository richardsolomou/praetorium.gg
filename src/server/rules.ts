import fs from 'node:fs'
import path from 'node:path'
import type { Secondary, Stratagem, StratagemLimit } from '../core/battle'

/**
 * Stratagems and secondary mission cards, from the Tabletop Developer Consortium's
 * dataset.
 *
 * The community catalogues carry neither, and this one is licensed CC BY 4.0 —
 * which is the whole reason it can be used at all. Attribution is a condition of
 * that licence rather than a courtesy, so `ATTRIBUTION` goes on screen wherever
 * this data does.
 */
export const ATTRIBUTION = 'Stratagems and mission cards by the Tabletop Developer Consortium, CC BY 4.0'

/** How the dataset words a usage limit, mapped onto what the battle enforces. */
const LIMITS: Record<string, StratagemLimit> = {
  'once-per-phase': 'phase',
  'once-per-turn': 'turn',
  'once-per-battle': 'battle',
  'once-per-battle-round': 'turn',
}

type RawStratagem = {
  id: string
  name: string
  category?: string
  detachment_id?: string | null
  cp_cost?: number
  timing?: string
  game_version?: { edition?: string; dataslate?: string }
}

type RawCard = { id: string; name: string; card_type?: string }

export type LoadedRules = {
  /** Faction slug then detachment slug, so a chosen detachment maps straight to its six. */
  byDetachment: Map<string, Map<string, Stratagem[]>>
  /** Stratagems every army has, offered alongside whatever the detachment brings. */
  core: Stratagem[]
  secondaries: Secondary[]
  /** Whatever the dataset says about how settled these numbers are. */
  dataslate: string | null
}

export function rulesDirectory(dataDirectory = process.env.DATA_DIR ?? '/data') {
  return process.env.RULES_DIR ?? path.join(path.resolve(dataDirectory), 'rules')
}

export function loadRules(directory = rulesDirectory()): LoadedRules | null {
  const core = path.join(directory, 'data', 'core')
  if (!fs.existsSync(core)) return null

  const byDetachment = new Map<string, Map<string, Stratagem[]>>()
  let dataslate: string | null = null

  for (const faction of fs.readdirSync(core, { withFileTypes: true })) {
    if (!faction.isDirectory() || faction.name.startsWith('_')) continue
    const file = path.join(core, faction.name, 'stratagems.json')
    if (!fs.existsSync(file)) continue

    const detachments = new Map<string, Stratagem[]>()
    for (const raw of readStratagems(file)) {
      dataslate ??= raw.game_version?.dataslate ?? null
      if (!raw.detachment_id) continue
      const existing = detachments.get(raw.detachment_id) ?? []
      existing.push(toStratagem(raw))
      detachments.set(raw.detachment_id, existing)
    }
    if (detachments.size) byDetachment.set(faction.name, detachments)
  }

  const coreStratagems = readStratagems(path.join(core, 'stratagems.json')).map(toStratagem)
  const secondaries = readCards(path.join(core, 'secondary-cards.json'))
    .filter((card) => card.card_type !== 'primary')
    .map((card) => ({ key: card.id, name: card.name }))
    .toSorted((left, right) => left.name.localeCompare(right.name))

  if (!byDetachment.size && !secondaries.length) return null
  return { byDetachment, core: coreStratagems, secondaries, dataslate }
}

function readStratagems(file: string): RawStratagem[] {
  if (!fs.existsSync(file)) return []
  const parsed: RawStratagem[] = JSON.parse(fs.readFileSync(file, 'utf8'))
  return parsed
}

function readCards(file: string): RawCard[] {
  if (!fs.existsSync(file)) return []
  const parsed: RawCard[] = JSON.parse(fs.readFileSync(file, 'utf8'))
  return parsed
}

/** Titled rather than shouted: the dataset stores names in capitals. */
function toStratagem(raw: RawStratagem): Stratagem {
  return {
    key: raw.id,
    name: titleCase(raw.name),
    cp: raw.cp_cost ?? 0,
    // An unrecognised timing becomes `unlimited` rather than a guess that would
    // wrongly stop a player using something.
    limit: LIMITS[raw.timing ?? ''] ?? 'unlimited',
  }
}

// An apostrophe is not a word boundary: "Mortarion's Teachings", never "Mortarion'S".
const titleCase = (name: string) =>
  name
    .toLocaleLowerCase()
    .replaceAll(/(^|[\s(\-–—])([a-z])/g, (_, before: string, letter: string) => `${before}${letter.toLocaleUpperCase()}`)

/** "Chaos - Death Guard" and "Death Lord's Chosen" both reduce to what the dataset keys on. */
export const slug = (name: string) =>
  name
    .split(' - ')
    .at(-1)!
    .toLocaleLowerCase()
    .replaceAll(/['’]/g, '')
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
