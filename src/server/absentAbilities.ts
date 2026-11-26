import fs from 'node:fs'
import path from 'node:path'
import type { CatalogueFile } from '../core/catalogue'
import { abilityKey } from '../shared/vsDataAbilities'
import { routeSlug } from '../core/slug'
import type { LoadedDatacards } from '../shared/datacards'
import type { VsDataSummariesFile } from '../shared/vsData'
import { readCatalogueComposition } from './catalogueComposition'

/** A datasheet and an ability profile on it, by BSData ids, that a rules version does not print. */
export type AbsentAbility = readonly [datasheet: string, profile: string]
/** A datasheet, by BSData id, and the `abilityKey` of an ability on it that a rules version does not print. */
export type AbsentAbilityName = readonly [datasheet: string, key: string]

/**
 * What a rules version's VS Data release marks absent from its datasheets: abilities BSData still gives a datasheet
 * that the version's sources do not print. `directory` is the version's catalogue, under `editions/` unless it is the base.
 */
export function absentAbilitiesFor(
  directory: string,
  editionId?: string,
): { profiles: readonly AbsentAbility[]; names: readonly AbsentAbilityName[] } {
  const release = compactReleaseIn(directory, editionId)
  return { profiles: release?.absentAbilities ?? [], names: release?.absentAbilityNames ?? [] }
}

/** Whether the rules version a catalogue directory holds marks a Detachment's rule absent, as `absentDetachmentRule` reads it. */
export const absentDetachmentRuleFor = (directory: string, editionId?: string) =>
  absentDetachmentRule(compactReleaseIn(directory, editionId))

/** A rules version's compacted release, read from the snapshot `directory` is, or is under for a rules version. */
export function compactReleaseIn(directory: string, editionId?: string) {
  // The base rules version is read from the snapshot's root even when named.
  const root = editionId && path.basename(path.dirname(directory)) === 'editions' ? path.resolve(directory, '..', '..') : directory
  const editions = readCatalogueComposition(root)?.editions ?? []
  const entry = editions.find((candidate) => (editionId ? candidate.edition.id === editionId : candidate.base))
  const id = entry?.summaries ?? entry?.edition.id ?? editionId
  const file = id ? path.join(root, 'summaries', `${id}.json`) : null
  if (!file || !fs.existsSync(file)) return null
  return JSON.parse(fs.readFileSync(file, 'utf8')) as {
    entries: Record<string, string[]>
    absentAbilities?: AbsentAbility[]
    absentAbilityNames?: AbsentAbilityName[]
    absentDetachmentRules?: [string, string][]
    keywords?: Record<string, string>
    units?: VsDataSummariesFile['units']
  }
}

type Hiding = { ids: Set<string>; keys: Set<string> }

/**
 * The files with each absent ability hidden on its datasheet, by its profile's id or, without one, by its name: its
 * profile where the datasheet's entry, or an entry only it links to, holds it, and that entry's link to it where the
 * profile is shared. A datasheet also carries what it marks absent as `absentAbilities`, which the datasheet walk
 * leaves out, so a shared entry another datasheet links to keeps it there. Files are shared between rules versions, so
 * only the path to what changes is copied.
 */
export function withoutAbsentAbilities(
  files: CatalogueFile[],
  absent: readonly AbsentAbility[],
  named: readonly AbsentAbilityName[] = [],
): CatalogueFile[] {
  if (!absent.length && !named.length) return files
  const byDatasheet = new Map<string, Hiding>()
  const of = (datasheet: string) =>
    byDatasheet.get(datasheet) ?? byDatasheet.set(datasheet, { ids: new Set(), keys: new Set() }).get(datasheet)!
  for (const [datasheet, profile] of absent) of(datasheet).ids.add(profile)
  for (const [datasheet, key] of named) of(datasheet).keys.add(key)
  const datasheets = new Map(byDatasheet)
  // An entry only one link reaches belongs to that link's datasheet alone, so it hides there in place.
  const linksTo = new Map<string, number>()
  const nodes = new Map<string, Record<string, unknown>>()
  const linksIn = (node: unknown, found: (target: string) => void): void => {
    if (Array.isArray(node)) return node.forEach((entry) => linksIn(entry, found))
    if (!node || typeof node !== 'object') return
    const fields = node as Record<string, unknown>
    if (fields.type === 'selectionEntry' && typeof fields.targetId === 'string') found(fields.targetId)
    for (const value of Object.values(fields)) if (value && typeof value === 'object') linksIn(value, found)
  }
  const index = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(index)
    if (!node || typeof node !== 'object') return
    const fields = node as Record<string, unknown>
    if (typeof fields.id === 'string' && !nodes.has(fields.id)) nodes.set(fields.id, fields)
    for (const value of Object.values(fields)) if (value && typeof value === 'object') index(value)
  }
  index(files)
  linksIn(files, (target) => linksTo.set(target, (linksTo.get(target) ?? 0) + 1))
  const queue = [...byDatasheet.keys()]
  for (let id = queue.pop(); id !== undefined; id = queue.pop()) {
    const hiding = byDatasheet.get(id)!
    linksIn(nodes.get(id), (target) => {
      if (linksTo.get(target) !== 1 || byDatasheet.has(target)) return
      byDatasheet.set(target, hiding)
      queue.push(target)
    })
  }
  const visit = (node: unknown, hiding: Hiding | undefined): unknown => {
    if (Array.isArray(node)) {
      const next = node.map((entry) => visit(entry, hiding))
      return next.some((entry, at) => entry !== node[at]) ? next : node
    }
    if (!node || typeof node !== 'object') return node
    const fields = node as Record<string, unknown>
    const active = (typeof fields.id === 'string' && byDatasheet.get(fields.id)) || hiding
    let changed: Record<string, unknown> | null = null
    for (const [key, value] of Object.entries(fields)) {
      const next = visit(value, active)
      if (next !== value) (changed ??= { ...fields })[key] = next
    }
    const byName = typeof fields.name === 'string' && active?.keys.has(abilityKey(fields.name))
    const absentHere =
      active &&
      !fields.hidden &&
      (('typeName' in fields &&
        typeof fields.id === 'string' &&
        (active.ids.has(fields.id) || (fields.typeName === 'Abilities' && byName))) ||
        (fields.type === 'profile' && ((typeof fields.targetId === 'string' && active.ids.has(fields.targetId)) || byName)))
    const marked = typeof fields.id === 'string' ? datasheets.get(fields.id) : undefined
    if (marked) (changed ??= { ...fields }).absentAbilities = { profiles: [...marked.ids], keys: [...marked.keys] }
    return absentHere ? { ...(changed ?? fields), hidden: true } : (changed ?? node)
  }
  return files.map((file) => visit(file, undefined) as CatalogueFile)
}

type ReleaseAbsences = {
  entries: Readonly<Record<string, readonly string[]>>
  absentDetachmentRules?: readonly (readonly [string, string])[]
} | null

/**
 * The `abilityKey`s of the rules a rules version marks absent under a Detachment, by the Praetorium faction and Detachment
 * slugs that print it: its own Detachment's, and, where another faction prints it, as a Chapter prints a Space Marines
 * Detachment, those of the one faction VS Data holds that Detachment under.
 */
export function absentDetachmentRuleKeys(release: ReleaseAbsences): (faction: string, detachment: string) => ReadonlySet<string> {
  const none: ReadonlySet<string> = new Set()
  const pairs = release?.absentDetachmentRules ?? []
  if (!pairs.length) return () => none
  const units = new Set(Object.keys(release!.entries).flatMap((key) => (key.startsWith('unit:') ? [key.slice('unit:'.length)] : [])))
  const marked = new Map<string, Set<string>>()
  const holders = new Map<string, Set<string>>()
  const hold = (owner: string) => {
    const [faction, detachment, ...rest] = owner.split('.')
    if (!faction || !detachment || rest.length || units.has(owner)) return
    holders.set(detachment, (holders.get(detachment) ?? new Set()).add(faction))
  }
  for (const key of Object.keys(release!.entries)) if (key.startsWith('ability:')) hold(key.slice('ability:'.length, key.lastIndexOf('.')))
  for (const [detachment, key] of pairs) {
    marked.set(detachment, (marked.get(detachment) ?? new Set()).add(key))
    hold(detachment)
  }
  return (faction, detachment) => {
    const owners = holders.get(detachment)
    const held = owners?.size === 1 ? marked.get(`${[...owners][0]}.${detachment}`) : undefined
    const own = marked.get(`${faction}.${detachment}`)
    return own && held ? new Set([...own, ...held]) : (own ?? held ?? none)
  }
}

/** Whether a rules version marks a Detachment's rule absent, as `absentDetachmentRuleKeys` reads its releases. */
export function absentDetachmentRule(release: ReleaseAbsences): (faction: string, detachment: string, rule: string) => boolean {
  const keys = absentDetachmentRuleKeys(release)
  return (faction, detachment, rule) => keys(faction, detachment).has(abilityKey(rule))
}

/**
 * The cards' Detachment rules by Detachment slug, without a rule every faction printing that Detachment marks absent, so
 * what reads the cards alone, as the weapon abilities a Detachment's rules grant, leaves it out as the rules do.
 */
export function withoutAbsentDetachmentRules(
  datacards: LoadedDatacards,
  absent: (faction: string, detachment: string, rule: string) => boolean,
): LoadedDatacards {
  const printers = new Map<string, Set<string>>()
  for (const content of new Set(datacards.factions.values()))
    for (const name of content.detachments)
      printers.set(
        routeSlug(name),
        (printers.get(routeSlug(name)) ?? new Set()).add(routeSlug(content.detachmentFactions?.get(name) ?? content.name)),
      )
  let changed = false
  const detachmentRules = new Map(
    [...datacards.detachmentRules].map(([detachment, rules]) => {
      const factions = [...(printers.get(detachment) ?? [''])]
      const kept = rules.filter((rule) => !factions.every((faction) => absent(faction, detachment, rule.name)))
      if (kept.length !== rules.length) changed = true
      return [detachment, kept] as const
    }),
  )
  return changed ? { ...datacards, detachmentRules } : datacards
}
