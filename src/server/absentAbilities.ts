import fs from 'node:fs'
import path from 'node:path'
import type { CatalogueFile } from '../core/catalogue'
import { abilityKey } from '../shared/vsDataAbilities'
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
  const root = editionId ? path.resolve(directory, '..', '..') : directory
  const id = editionId ?? readCatalogueComposition(directory)?.editions.find((entry) => entry.base)?.edition.id
  const file = id ? path.join(root, 'summaries', `${id}.json`) : null
  if (!file || !fs.existsSync(file)) return { profiles: [], names: [] }
  const { absentAbilities, absentAbilityNames } = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    absentAbilities?: AbsentAbility[]
    absentAbilityNames?: AbsentAbilityName[]
  }
  return { profiles: absentAbilities ?? [], names: absentAbilityNames ?? [] }
}

type Hiding = { ids: Set<string>; keys: Set<string> }

/**
 * The files with each absent ability hidden on its datasheet, by its profile's id or, without one, by its name: its
 * profile where the datasheet's entry holds it, and the entry's link to it where the profile is shared, so another
 * datasheet that prints it keeps it. A datasheet that is a faction's link to a shared entry hides it in that entry,
 * where every link to the entry is such a datasheet. Files are shared between rules versions, so only the path to what
 * changes is copied.
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
  // A shared entry every link to which is an absent ability's datasheet, or lies within one, hides what they all hide.
  const linksTo = new Map<string, string[]>()
  const nodes = new Map<string, Record<string, unknown>>()
  const linksIn = (node: unknown, found: (link: string, target: string) => void): void => {
    if (Array.isArray(node)) return node.forEach((entry) => linksIn(entry, found))
    if (!node || typeof node !== 'object') return
    const fields = node as Record<string, unknown>
    if (fields.type === 'selectionEntry' && typeof fields.id === 'string' && typeof fields.targetId === 'string')
      found(fields.id, fields.targetId)
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
  linksIn(files, (link, target) => linksTo.set(target, [...(linksTo.get(target) ?? []), link]))
  const reachedBy = new Map<string, Map<string, Hiding>>()
  const queue = [...byDatasheet.keys()]
  for (let id = queue.pop(); id !== undefined; id = queue.pop()) {
    const hiding = byDatasheet.get(id)!
    linksIn(nodes.get(id), (link, target) => {
      const reached = reachedBy.get(target) ?? reachedBy.set(target, new Map()).get(target)!
      reached.set(link, hiding)
      if (byDatasheet.has(target) || !linksTo.get(target)?.every((each) => reached.has(each))) return
      const [first, ...rest] = [...reached.values()]
      const shared = {
        ids: new Set([...first!.ids].filter((held) => rest.every((other) => other.ids.has(held)))),
        keys: new Set([...first!.keys].filter((held) => rest.every((other) => other.keys.has(held)))),
      }
      if (!shared.ids.size && !shared.keys.size) return
      byDatasheet.set(target, shared)
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
    return absentHere ? { ...(changed ?? fields), hidden: true } : (changed ?? node)
  }
  return files.map((file) => visit(file, undefined) as CatalogueFile)
}
