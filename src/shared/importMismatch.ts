/**
 * Why a name in an imported list did not reach the roster the player wrote it into.
 *
 * The import already knows what it could not place. This module is the one place that
 * says why, because a warning that names only what went missing leaves the player to
 * guess between three different mistakes: a name their exporter spells differently, a
 * datasheet that never offered the thing, and an enhancement that belongs to a
 * detachment they did not take. Each of those is fixed somewhere else, so each is
 * worth a sentence of its own.
 */

import { countLabel, plainQuotes, plainDashes } from '../core/text'
import { cachedIn, remember } from '../core/collections'
import { type CatalogueIndex, nameOf } from '../core/catalogue'
import { eachDefinition } from '../core/definitions'
import type { UnitSize } from '../core/unitSize'
import type { LoadedCatalogue } from './catalogueIndex'
import { descriptionKey } from './datacards'
import { factionDisplayName } from './factionNames'
import type { CatalogueHistoryEntry } from '../core/catalogueHistory'

/** What each faction's data updates removed and never brought back, by name: an older list can still name it. */
export type RemovedNames = ReadonlyMap<string, ReadonlyMap<string, { kind: 'datasheet' | 'detachment' | 'enhancement'; at: number }>>

export const NO_REMOVALS: RemovedNames = new Map()

export function removedNamesOf(history: readonly Pick<CatalogueHistoryEntry, 'recordedAt' | 'changes'>[]): RemovedNames {
  const removed = new Map<string, Map<string, { kind: 'datasheet' | 'detachment' | 'enhancement'; at: number }>>()
  for (const entry of history.toSorted((left, right) => left.recordedAt - right.recordedAt))
    for (const faction of entry.changes.factions) {
      const names = remember(removed, faction.catalogueId, () => new Map())
      for (const change of faction.changes) {
        const [kind, outcome] = change.kind.split('-') as [string, string]
        if (kind !== 'datasheet' && kind !== 'detachment' && kind !== 'enhancement') continue
        if (outcome === 'removed') names.set(normalized(change.name), { kind, at: entry.recordedAt })
        else if (outcome === 'added') names.delete(normalized(change.name))
      }
    }
  return removed
}

const updateDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

/** Why a name a list states is gone, where a data update removed something of that kind by that name. */
function removedReason(stated: string, kind: 'datasheet' | 'detachment' | 'enhancement', catalogueId: string, removed: RemovedNames) {
  const found = removed.get(catalogueId)?.get(normalized(stated))
  return found?.kind === kind ? `removed in the ${updateDate.format(found.at)} data update` : null
}

/** A name an import could not resolve at all, and what was wrong with it. */
export type UnmatchedName = { name: string; reason: string }

/** A choice a list states that its unit could not be given, and what stopped it. */
export type UnplacedChoice = { name: string; reason: string }

export const normalized = (value: string) =>
  plainQuotes(
    plainDashes(value)
      .trim()
      .toLocaleLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/\[\d+\]$/, ''),
  )

export function unmatchedFactionReason(stated: string, availableNames: readonly string[]): string {
  const near = closestName(
    stated,
    availableNames.map((name) => factionDisplayName(name)),
  )
  return near ? `no faction is called that; the closest is "${near}"` : 'no faction in the catalogue is called that'
}

/**
 * A unit a list names that its faction has no datasheet for.
 *
 * A name another faction holds is the common half of it — a list pasted against the
 * wrong book, or an exporter that writes the subfaction a unit was bought from.
 */
export function unmatchedDatasheetReason(
  stated: string,
  catalogueId: string,
  loaded: LoadedCatalogue,
  removed: RemovedNames = NO_REMOVALS,
): string {
  const faction = factionOf(loaded, catalogueId)
  const other = otherFaction(stated, catalogueId, loaded)
  if (other) return `a ${other} datasheet, not ${faction}`
  const gone = removedReason(stated, 'datasheet', catalogueId, removed)
  if (gone) return gone
  const near = closestName(stated, datasheetNames(loaded, catalogueId))
  if (near) return `no ${faction} datasheet is called that; the closest is "${near}"`
  if (factionNames(loaded, catalogueId).has(normalized(stated))) return `${faction} has this, but not as a datasheet`
  return `no ${faction} datasheet is called that`
}

export function unmatchedDetachmentReason(
  stated: string,
  catalogueId: string,
  loaded: LoadedCatalogue,
  removed: RemovedNames = NO_REMOVALS,
): string {
  const gone = removedReason(stated, 'detachment', catalogueId, removed)
  if (gone) return gone
  const options = loaded.detachments.get(catalogueId)?.options ?? []
  const near = closestName(
    stated,
    options.map((option) => option.name),
  )
  const faction = factionOf(loaded, catalogueId)
  return near ? `no ${faction} detachment is called that; the closest is "${near}"` : `no ${faction} detachment is called that`
}

/**
 * A name the list states against a unit that the built unit has nowhere to put.
 *
 * The catalogue knowing the name at all is what separates a list this instance reads
 * differently from a list asking for something the datasheet does not offer.
 */
export function unplacedChoiceReason(
  stated: string,
  where: { loaded: LoadedCatalogue; catalogueId: string; detachmentIds: readonly string[]; removed?: RemovedNames },
): string {
  const { loaded, catalogueId, detachmentIds, removed = NO_REMOVALS } = where
  const detachment = enhancementDetachment(stated, loaded, catalogueId)
  if (detachment) {
    return detachmentIds.includes(detachment.id)
      ? 'this datasheet cannot take that enhancement'
      : `an enhancement of the ${detachment.name} detachment`
  }
  if (factionNames(loaded, catalogueId).has(normalized(stated))) return 'this datasheet does not offer it'
  return (
    removedReason(stated, 'enhancement', catalogueId, removed) ??
    `nothing in the ${factionOf(loaded, catalogueId)} catalogue is called that`
  )
}

export const WARLORD_REASON = 'this datasheet has no Warlord option'

/** An option the datasheet offers that the imported unit still holds none of, such as a heavy weapon whose model is not in the squad. */
export const DROPPED_REASON = 'no model in the imported unit carries it'

export function squadSizeReason(size: UnitSize): string {
  if (size.options?.length) return `this datasheet fields ${size.options.join(' or ')} models`
  if (size.min === size.max) return `this datasheet fields ${countLabel(size.min, 'model')}`
  return `this datasheet fields ${size.min} to ${size.max} models`
}

export const attachmentReason = (target: string, imported: boolean) =>
  imported ? `every ${target} in this list is already led` : `this list has no ${target}`

const factionOf = (loaded: LoadedCatalogue, catalogueId: string) =>
  factionDisplayName(loaded.index.catalogues.get(catalogueId)?.name ?? catalogueId)

/**
 * The factions whose datasheets hold this name, when they are not the one being
 * imported into. Two are named where two have it, because a Plague Marine bought from
 * the wrong book is as likely to belong to either.
 */
function otherFaction(stated: string, catalogueId: string, loaded: LoadedCatalogue): string | null {
  const elsewhere = [...(datasheetFactions(loaded).get(normalized(stated)) ?? [])]
    .filter((id) => id !== catalogueId)
    .map((id) => factionOf(loaded, id))
    .filter(Boolean)
  return elsewhere.length ? elsewhere.slice(0, 2).join(' or ') : null
}

/** Which detachment of this faction prints an enhancement by that name, if any does. */
function enhancementDetachment(stated: string, loaded: LoadedCatalogue, catalogueId: string) {
  const options = loaded.detachments.get(catalogueId)?.options ?? []
  return options.find((option) => loaded.datacards.enhancements.has(descriptionKey(option.name, stated))) ?? null
}

const factionNameCache = new WeakMap<CatalogueIndex, Map<string, Set<string>>>()

/**
 * Every name reachable from the datasheets a faction offers, wargear and enhancements
 * included. Reading the catalogue a definition was declared in would miss both, since
 * a book reaches most of its range through a library it imports.
 */
function factionNames(loaded: LoadedCatalogue, catalogueId: string): ReadonlySet<string> {
  return cachedIn(factionNameCache, loaded.index, catalogueId, () => namesIn(loaded.index, catalogueId))
}

function namesIn(index: CatalogueIndex, catalogueId: string) {
  const names = new Set<string>()
  eachDefinition(index.datasheets.get(catalogueId) ?? [], index, (definition) =>
    names.add(normalized(nameOf(definition, index.definitions))),
  )
  return names
}

const datasheetFactionCache = new WeakMap<CatalogueIndex, Map<string, string[]>>()

/** Which factions offer a datasheet under each name, for a name this one does not hold. */
function datasheetFactions(loaded: LoadedCatalogue): ReadonlyMap<string, readonly string[]> {
  return remember(datasheetFactionCache, loaded.index, () => {
    const found = new Map<string, string[]>()
    for (const [catalogueId, entries] of loaded.index.datasheets) {
      for (const id of entries) {
        const definition = loaded.index.definitions.get(id)
        if (!definition) continue
        const name = normalized(nameOf(definition, loaded.index.definitions))
        const factions = found.get(name) ?? []
        if (!factions.includes(catalogueId)) factions.push(catalogueId)
        found.set(name, factions)
      }
    }
    return found
  })
}

/**
 * The one faction offering more of these datasheets than any other, and more than half of them.
 *
 * The official app translates the faction's name but prints datasheets in English, so a
 * list whose faction is named in another language still says which army it is.
 */
export function factionOfDatasheets(names: readonly string[], loaded: LoadedCatalogue): string | null {
  const factions = new Set(loaded.factions.map((faction) => faction.id))
  const counts = new Map<string, number>()
  for (const name of names)
    for (const id of datasheetFactions(loaded).get(normalized(name)) ?? []) if (factions.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1)
  const most = Math.max(0, ...counts.values())
  const leaders = [...counts].filter(([, count]) => count === most)
  return leaders.length === 1 && most * 2 > names.length ? leaders[0]![0] : null
}

/**
 * The one other faction offering every one of these datasheets some faction offers, where the stated one offers some but
 * not all, as the Ultramarines for a list stated as Space Marines that fields Marneus Calgar. A list sharing no datasheet
 * with the faction it states is pasted against the wrong one, not a chapter of it.
 */
export function chapterOfDatasheets(names: readonly string[], catalogueId: string, loaded: LoadedCatalogue): string | null {
  const offering = names.flatMap((name) => {
    const ids = datasheetFactions(loaded).get(normalized(name))
    return ids?.length ? [ids] : []
  })
  const own = offering.filter((ids) => ids.includes(catalogueId)).length
  if (!own || own === offering.length) return null
  const candidates = loaded.factions.filter((faction) => faction.id !== catalogueId && offering.every((ids) => ids.includes(faction.id)))
  return candidates.length === 1 ? candidates[0]!.id : null
}

function datasheetNames(loaded: LoadedCatalogue, catalogueId: string): string[] {
  return [...(loaded.index.datasheets.get(catalogueId) ?? [])].flatMap((id) => {
    const definition = loaded.index.definitions.get(id)
    return definition ? [nameOf(definition, loaded.index.definitions)] : []
  })
}

/**
 * The nearest candidate, named only when it is near enough to be worth reading.
 *
 * Words rather than letters, because the differences that send an import wrong are
 * whole words: a plural, a "Squad" one exporter prints and another does not.
 */
function closestName(stated: string, candidates: Iterable<string>): string | null {
  const wanted = words(stated)
  if (!wanted.size) return null
  let best: { name: string; score: number } | null = null
  for (const candidate of candidates) {
    const other = words(candidate)
    const shared = [...wanted].filter((word) => other.has(word)).length
    const score = shared / (wanted.size + other.size - shared)
    if (score > (best?.score ?? 0)) best = { name: candidate, score }
  }
  return best && best.score >= 0.5 ? best.name : null
}

const words = (value: string) =>
  new Set(
    normalized(value)
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .map((word) => word.replace(/ies$/, 'y').replace(/s$/, '')),
  )
