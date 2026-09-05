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

import { type CatalogueIndex, type Definition, nameOf } from '../core/catalogue'
import { childrenOf, resolve } from '../core/definitions'
import type { UnitSize } from '../core/unitSize'
import type { LoadedCatalogue } from './catalogueIndex'
import { descriptionKey } from './datacards'
import { factionDisplayName } from './factionNames'

/** A name an import could not resolve at all, and what was wrong with it. */
export type UnmatchedName = { name: string; reason: string }

/** A choice a list states that its unit could not be given, and what stopped it. */
export type UnplacedChoice = { name: string; reason: string }

/**
 * Choices one unit could not be given, named back once however many copies a list
 * holds: the same gap is one thing to go and fix. `entryId` is what the editor marks
 * its cards by, since a display name can be spelled more than one way.
 */
export type UnplacedChoices = { unit: string; entryId: string; choices: UnplacedChoice[] }

/**
 * What an import could not do, kept with the list it made.
 *
 * A player dropped straight into the editor has no other way to learn that a unit
 * did not arrive, or did not arrive as they wrote it, so the report rides along with
 * the roster until they say they have read it.
 */
export type ImportReport = { missing: UnmatchedName[]; unplaced: UnplacedChoices[] }

export const normalized = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\[\d+\]$/, '')
    .replaceAll(/[’‘]/g, "'")

export function unmatchedFactionReason(stated: string, loaded: LoadedCatalogue): string {
  const near = closestName(
    stated,
    loaded.factions.map((faction) => factionDisplayName(faction.name)),
  )
  return near ? `no faction is called that; the closest is "${near}"` : 'no faction in the catalogue is called that'
}

/**
 * A unit a list names that its faction has no datasheet for.
 *
 * A name another faction holds is the common half of it — a list pasted against the
 * wrong book, or an exporter that writes the subfaction a unit was bought from.
 */
export function unmatchedDatasheetReason(stated: string, catalogueId: string, loaded: LoadedCatalogue): string {
  const faction = factionOf(loaded, catalogueId)
  const other = otherFaction(stated, catalogueId, loaded)
  if (other) return `a ${other} datasheet, not ${faction}`
  const near = closestName(stated, datasheetNames(loaded, catalogueId))
  if (near) return `no ${faction} datasheet is called that; the closest is "${near}"`
  if (factionNames(loaded, catalogueId).has(normalized(stated))) return `${faction} has this, but not as a datasheet`
  return `no ${faction} datasheet is called that`
}

export function unmatchedDetachmentReason(stated: string, catalogueId: string, loaded: LoadedCatalogue): string {
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
  where: { loaded: LoadedCatalogue; catalogueId: string; detachmentIds: readonly string[] },
): string {
  const { loaded, catalogueId, detachmentIds } = where
  const detachment = enhancementDetachment(stated, loaded, catalogueId)
  if (detachment) {
    return detachmentIds.includes(detachment.id)
      ? 'this datasheet cannot take that enhancement'
      : `an enhancement of the ${detachment.name} detachment`
  }
  if (factionNames(loaded, catalogueId).has(normalized(stated))) return 'this datasheet does not offer it'
  return `nothing in the ${factionOf(loaded, catalogueId)} catalogue is called that`
}

export const WARLORD_REASON = 'this datasheet has no Warlord option'

export function squadSizeReason(size: UnitSize): string {
  if (size.options?.length) return `this datasheet fields ${size.options.join(' or ')} models`
  if (size.min === size.max) return `this datasheet fields ${size.min} model${size.min === 1 ? '' : 's'}`
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
  const { index } = loaded
  const cached = factionNameCache.get(index) ?? new Map<string, Set<string>>()
  if (!factionNameCache.has(index)) factionNameCache.set(index, cached)
  const existing = cached.get(catalogueId)
  if (existing) return existing

  const names = new Set<string>()
  const seen = new Set<string>()
  const walk = (definition: Definition) => {
    const target = resolve(definition, index)
    if (seen.has(target.id)) return
    seen.add(target.id)
    names.add(normalized(nameOf(definition, index.definitions)))
    for (const child of childrenOf(target, index)) walk(child.definition)
  }
  for (const id of index.datasheets.get(catalogueId) ?? []) {
    const definition = index.definitions.get(id)
    if (definition) walk(definition)
  }
  cached.set(catalogueId, names)
  return names
}

const datasheetFactionCache = new WeakMap<CatalogueIndex, Map<string, string[]>>()

/** Which factions offer a datasheet under each name, for a name this one does not hold. */
function datasheetFactions(loaded: LoadedCatalogue): ReadonlyMap<string, readonly string[]> {
  const cached = datasheetFactionCache.get(loaded.index)
  if (cached) return cached
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
  datasheetFactionCache.set(loaded.index, found)
  return found
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
