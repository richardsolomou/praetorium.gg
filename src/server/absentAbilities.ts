import fs from 'node:fs'
import path from 'node:path'
import type { CatalogueFile } from '../core/catalogue'
import { readCatalogueComposition } from './catalogueComposition'

/** A datasheet and an ability profile on it, by BSData ids, that a rules version does not print. */
export type AbsentAbility = readonly [datasheet: string, profile: string]

/**
 * What a rules version's VS Data release marks absent from its datasheets: abilities BSData still gives a datasheet
 * that the version's sources do not print. `directory` is the version's catalogue, under `editions/` unless it is the base.
 */
export function absentAbilitiesFor(directory: string, editionId?: string): readonly AbsentAbility[] {
  const root = editionId ? path.resolve(directory, '..', '..') : directory
  const id = editionId ?? readCatalogueComposition(directory)?.editions.find((entry) => entry.base)?.edition.id
  const file = id ? path.join(root, 'summaries', `${id}.json`) : null
  if (!file || !fs.existsSync(file)) return []
  const { absentAbilities } = JSON.parse(fs.readFileSync(file, 'utf8')) as { absentAbilities?: AbsentAbility[] }
  return absentAbilities ?? []
}

/**
 * The files with each absent ability hidden on its datasheet: its profile where the datasheet's entry holds it, and the
 * entry's link to it where the profile is shared, so another datasheet that prints it keeps it. Files are shared between
 * rules versions, so only the path to what changes is copied.
 */
export function withoutAbsentAbilities(files: CatalogueFile[], absent: readonly AbsentAbility[]): CatalogueFile[] {
  if (!absent.length) return files
  const byDatasheet = new Map<string, Set<string>>()
  for (const [datasheet, profile] of absent) byDatasheet.set(datasheet, (byDatasheet.get(datasheet) ?? new Set()).add(profile))
  const visit = (node: unknown, hiding: ReadonlySet<string> | undefined): unknown => {
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
    const absentHere =
      active &&
      !fields.hidden &&
      (('typeName' in fields && typeof fields.id === 'string' && active.has(fields.id)) ||
        (fields.type === 'profile' && typeof fields.targetId === 'string' && active.has(fields.targetId)))
    return absentHere ? { ...(changed ?? fields), hidden: true } : (changed ?? node)
  }
  return files.map((file) => visit(file, undefined) as CatalogueFile)
}
