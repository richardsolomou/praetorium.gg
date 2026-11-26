import fs from 'node:fs'
import path from 'node:path'
import { remember } from '../core/collections'
import type { TextFacts, TextFactsByKey } from '../core/textFacts'
import type { DefinitionTexts } from '../shared/catalogueIndex'
import { gdcRuleRecords, vsDataIndex, vsDataKey, vsDataRecordOfBsdata } from '../shared/vsData'
import { textFactsOfVsData, vsDataEffectsPath, type VsDataEffectsFile } from '../shared/vsDataEffects'
import { bsdataRecordsIn } from './bsdataRecords'
import { readCatalogueComposition } from './catalogueComposition'
import { readSharedJson } from './sharedJson'
import { textHash } from './sourceTexts'
import { readVsDataRelease } from './vsDataSummaries'

/** The records a rule's text can be: an ability of a datasheet, army or detachment, or a core or weapon ability. */
const RULE_RECORD = /^(?:ability|core-ability|weapon-ability):/

/** A summary stands for a whole rule, so only a token showing a whole string joins its record. */
const WHOLE_STRING = new Set(['prose', 'plain', 'trim'])

/** How a text found its VS Data record, for the parity report. */
export type VsDataJoin = { record: string; by: 'card' | 'id' } | { record: null; by: 'none' | 'ambiguous' }

export type VsDataTextFacts = TextFactsByKey & {
  join: (key: string) => VsDataJoin
  /** The records the cards printing a lone whole-string token are, which a catalogue text it stands in for must be. */
  printed: (key: string) => readonly string[]
}

/**
 * What each text of a rules version states, by `factsKey`, read from the VS Data record it joins: a card's string joins
 * the record VS Data aliases its card to, as its summary does; a catalogue string joins the record the BSData rule or
 * profile holding it is (`vsDataRecordOfBsdata`). A text that joins no record VS Data has read, or several that say
 * different things, has no facts here; none is matched by name.
 * Null where the snapshot keeps no effect blocks for the rules version.
 */
export function vsDataTextFacts(
  /** The snapshot, which holds every rules version's release. */
  root: string,
  edition: string | undefined,
  /** The rules version's own folder of card files. */
  cardDirectory: string,
  definitions: Pick<DefinitionTexts, 'holders'>,
): VsDataTextFacts | null {
  const entry = readCatalogueComposition(root)?.editions.find((candidate) => (edition ? candidate.edition.id === edition : candidate.base))
  const file = entry && path.join(root, 'summaries', `${entry.summaries ?? entry.edition.id}.json`)
  const release = entry && readVsDataRelease(root, entry.edition.id)
  if (!file || !release || !fs.existsSync(vsDataEffectsPath(file))) return null
  const effects = (JSON.parse(fs.readFileSync(vsDataEffectsPath(file), 'utf8')) as VsDataEffectsFile).effects
  const index = vsDataIndex(release.entries)
  // Each whole card string's records, by its hash.
  const printed = new Map<string, string[]>()
  for (const card of jsonFiles(cardDirectory))
    for (const { keys, texts } of gdcRuleRecords(readSharedJson(card))) {
      const ref = index.entry(keys)
      if (!ref) continue
      for (const hash of new Set(texts.flatMap((text) => [textHash(text), textHash(text.trim())])))
        if (!printed.get(hash)?.includes(vsDataKey(ref))) remember(printed, hash, () => []).push(vsDataKey(ref))
    }
  // The record each BSData rule, profile or entry is, by VS Data's alias of it or the frozen map, on the datasheet it is one.
  const records = bsdataRecordsIn(release.entries, entry.base ? null : entry.edition.id)
  // The one reading candidates give, those VS Data has read first, as a record without blocks has not been read: the
  // candidate holding every block any of them holds, as each other reads it. VS Data leaves `reachesAttached` off the
  // rule of a unit no Leader joins, where it reaches nothing, so the reading with it serves both.
  const blocksOf = new Map<string, Map<string, string>>()
  const blocks = (key: string) =>
    remember(
      blocksOf,
      key,
      () => new Map(Object.entries(effects[key] ?? {}).map(([block, value]) => [block, JSON.stringify(unreached(value))])),
    )
  const reaches = (key: string) => blocks(key).get('combat') !== JSON.stringify(effects[key]?.combat)
  const agreed = (keys: readonly string[]) => {
    const read = keys.filter((key) => effects[key]).toSorted((left, right) => Number(reaches(right)) - Number(reaches(left)))
    if (!read.length) return keys[0] ?? null
    return read.find((key) => read.every((other) => [...blocks(other)].every(([block, value]) => blocks(key).get(block) === value))) ?? null
  }
  const joinOf = (factsKey: string): VsDataJoin => {
    const keys = factsKey.startsWith('+') ? factsKey.slice(1).split('+') : [factsKey]
    const tokens = keys.map((key) => ({ transform: key.slice(0, key.indexOf(':')), hash: key.slice(key.indexOf(':') + 1) }))
    const held = tokens.every((token) => WHOLE_STRING.has(token.transform))
      ? tokens.map((token) => printed.get(token.hash) ?? []).reduce((shared, ids) => shared.filter((id) => ids.includes(id)))
      : []
    const card = agreed(held)
    if (card) return { record: card, by: 'card' }
    if (keys.length !== 1) return { record: null, by: held.length ? 'ambiguous' : 'none' }
    // Of the records a card's string joins, or else of all, the one the catalogue rules or profiles holding it are, on the
    // datasheet each is held within where the frozen map files a profile several datasheets share under each.
    const holders = definitions.holders?.(factsKey) ?? []
    const within = (candidates: readonly string[]) => (held.length ? candidates.filter((key) => held.includes(key)) : candidates)
    const byId = within([
      ...new Set(
        holders.flatMap((holder) =>
          [
            ...holder.within.map((sheet) => vsDataRecordOfBsdata(records, holder.id, sheet)),
            vsDataRecordOfBsdata(records, holder.id),
          ].flatMap((key) => (key && RULE_RECORD.test(key) ? [key] : [])),
        ),
      ),
    ])
    const found = agreed(byId)
    if (found) return { record: found, by: 'id' }
    return { record: null, by: byId.length || held.length ? 'ambiguous' : 'none' }
  }
  const joins = new Map<string, VsDataJoin>()
  const facts = new Map<string, TextFacts>()
  const join = (key: string) => remember(joins, key, () => joinOf(key))
  return {
    join,
    printed: (key) => (WHOLE_STRING.has(key.slice(0, key.indexOf(':'))) ? (printed.get(key.slice(key.indexOf(':') + 1)) ?? []) : []),
    get: (key) => {
      const { record } = join(key)
      // A record without blocks is one VS Data has not read yet.
      if (!record || !effects[record]) return undefined
      const read = effects[record]
      return remember(facts, record, () =>
        textFactsOfVsData(record === FEEL_NO_PAIN && read.combat ? { ...read, combat: asDefenders(read.combat) } : read),
      )
    },
  }
}

/**
 * Feel No Pain's core record reads no roll, which only the ability's name gives, as "Feel No Pain 4+", and the simulator
 * applies from that name: the record stays a defender's rule it lists, as the ability is.
 */
const FEEL_NO_PAIN = 'core-ability:feel-no-pain'
const asDefenders = (combat: unknown) => {
  const block = combat as { readings: Record<string, unknown>[] }
  return { ...block, readings: block.readings.map((reading) => ({ ...reading, roles: reading.roles ?? ['defender'] })) }
}

/** A block as it reads wherever a Leader can join its unit or not. */
function unreached(block: unknown) {
  if (!block || typeof block !== 'object' || !('applies' in block)) return block
  const { applies, ...rest } = block as { applies: Record<string, unknown> }
  const { reachesAttached: _reachesAttached, ...others } = applies
  return { ...(Object.keys(others).length ? { applies: others } : {}), ...rest }
}

function jsonFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return []
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? jsonFiles(path.join(directory, entry.name))
        : entry.name.endsWith('.json')
          ? [path.join(directory, entry.name)]
          : [],
    )
}
