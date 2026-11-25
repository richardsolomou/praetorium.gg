import fs from 'node:fs'
import path from 'node:path'
import { remember } from '../core/collections'
import type { TextFacts, TextFactsByKey } from '../core/textFacts'
import type { DefinitionTexts } from '../shared/catalogueIndex'
import { gdcRuleRecords, vsDataIndex, vsDataKey } from '../shared/vsData'
import { abilityKey } from '../shared/vsDataAbilities'
import { textFactsOfVsData, vsDataEffectsPath, type VsDataEffectsFile } from '../shared/vsDataEffects'
import { readCatalogueComposition } from './catalogueComposition'
import { readSharedJson } from './sharedJson'
import { textHash } from './sourceTexts'
import { readVsDataRelease } from './vsDataSummaries'

/** A summary stands for a whole rule, so only a token showing a whole string joins its record. */
const WHOLE_STRING = new Set(['prose', 'plain', 'trim'])

/** How a text found its VS Data record, for the parity report. */
export type VsDataJoin = { record: string; by: 'card' | 'alias' | 'name' } | { record: null; by: 'none' | 'ambiguous' }

export type VsDataTextFacts = TextFactsByKey & { join: (key: string) => VsDataJoin }

/**
 * What each text of a rules version states, by `factsKey`, read from the VS Data record it joins: a card's string joins
 * the record VS Data aliases its card to, as its summary does; a catalogue string joins the record VS Data aliases the
 * rule or profile holding it to, else the record of that rule's name, its own faction's where several factions' say
 * otherwise. A text that joins no record VS Data has read, or several that say different things, has no facts here.
 * Null where the snapshot keeps no effect blocks for the rules version.
 */
export function vsDataTextFacts(
  /** The snapshot, which holds every rules version's release. */
  root: string,
  edition: string | undefined,
  /** The rules version's own folder of card files. */
  cardDirectory: string,
  definitions: Pick<DefinitionTexts, 'holders' | 'files'>,
  datasheets: ReadonlyMap<string, ReadonlySet<string>>,
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
  // The record VS Data aliases a BSData rule, profile or entry to, by its id as BSData writes it.
  const aliased = new Map<string, string>()
  for (const [key, aliases] of Object.entries(release.entries))
    for (const alias of aliases) if (alias.startsWith('bsdata.')) aliased.set(alias.slice('bsdata.'.length).replaceAll('.', '-'), key)
  // Each ability record by its name's key.
  const named = new Map<string, string[]>()
  for (const key of Object.keys(release.entries))
    if (key.startsWith('ability:')) remember(named, abilityKey(key.slice(key.lastIndexOf('.') + 1)), () => []).push(key)
  // The VS Data factions a catalogue's own datasheets belong to, and those of each catalogue that imports it, as a library.
  const factionsOf = new Map<string, Set<string>>()
  const factionOf = (key: string) => key.slice(key.indexOf(':') + 1, key.indexOf('.'))
  for (const [catalogue, entries] of datasheets)
    for (const id of entries) {
      const unit = aliased.get(id)
      if (unit?.startsWith('unit:')) remember(factionsOf, catalogue, () => new Set()).add(factionOf(unit))
    }
  for (const { file: read } of definitions.files) {
    const book = read.catalogue ?? read.gameSystem
    for (const link of book?.catalogueLinks ?? [])
      for (const faction of factionsOf.get(book!.id) ?? []) remember(factionsOf, link.targetId, () => new Set()).add(faction)
  }
  // The one reading candidates give, those VS Data has read first: a record without blocks has not been read.
  const agreed = (keys: readonly string[]) => {
    const read = keys.filter((key) => effects[key])
    const pool = read.length ? read : keys
    return pool.length && new Set(pool.map((key) => JSON.stringify(effects[key] ?? null))).size === 1 ? pool[0]! : null
  }
  // A Damaged profile is named for its wounds, as "Damaged: 1-4 Wounds Remaining", and VS Data's record is Damaged.
  const nameKeys = (name: string) => [...new Set([abilityKey(name), abilityKey(name.split(':')[0]!)])]

  const joinOf = (factsKey: string): VsDataJoin => {
    const keys = factsKey.startsWith('+') ? factsKey.slice(1).split('+') : [factsKey]
    const tokens = keys.map((key) => ({ transform: key.slice(0, key.indexOf(':')), hash: key.slice(key.indexOf(':') + 1) }))
    const held = tokens.every((token) => WHOLE_STRING.has(token.transform))
      ? tokens.map((token) => printed.get(token.hash) ?? []).reduce((shared, ids) => shared.filter((id) => ids.includes(id)))
      : []
    const card = agreed(held)
    if (card) return { record: card, by: 'card' }
    if (keys.length !== 1) return { record: null, by: held.length ? 'ambiguous' : 'none' }
    // Of the records a card's string joins, or else of all, the one the catalogue rule or profile holding it names: by
    // its alias, else by its name, its own datasheet's record first, then its own faction's.
    const holders = definitions.holders?.(factsKey) ?? []
    const within = (candidates: readonly string[]) => (held.length ? candidates.filter((key) => held.includes(key)) : candidates)
    const byAlias = within(
      [...new Set(holders.flatMap((holder) => aliased.get(holder.id) ?? []))].filter((key) => key.startsWith('ability:')),
    )
    const alias = agreed(byAlias)
    if (alias) return { record: alias, by: 'alias' }
    const byName = within([...new Set(holders.flatMap((holder) => nameKeys(holder.name).flatMap((name) => named.get(name) ?? [])))])
    const owners = holders.flatMap((holder) =>
      holder.within.flatMap((id) => aliased.get(id) ?? []).filter((key) => key.startsWith('unit:')),
    )
    const ownSheet = byName.filter((key) => owners.some((owner) => key.startsWith(`ability:${owner.slice('unit:'.length)}.`)))
    const ownFaction = byName.filter((key) => holders.some((holder) => factionsOf.get(holder.catalogue ?? '')?.has(factionOf(key))))
    for (const candidates of [byName, ownSheet, ownFaction]) {
      const found = agreed(candidates)
      if (found) return { record: found, by: 'name' }
    }
    return { record: null, by: byName.length || byAlias.length || held.length ? 'ambiguous' : 'none' }
  }
  const joins = new Map<string, VsDataJoin>()
  const facts = new Map<string, TextFacts>()
  const join = (key: string) => remember(joins, key, () => joinOf(key))
  return {
    join,
    get: (key) => {
      const { record } = join(key)
      // A record without blocks is one VS Data has not read yet.
      return record && effects[record] ? remember(facts, record, () => textFactsOfVsData(effects[record]!)) : undefined
    },
  }
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
