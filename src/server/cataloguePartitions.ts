import type { CatalogueFile } from '../core/catalogue'

export type NamedCatalogueFile = { name: string; file: CatalogueFile }

/** A faction needs its game system and every file containing a target it can reach. */
export function cataloguePartitions(files: readonly NamedCatalogueFile[]): Map<string, string[]> {
  const owners = new Map<string, string>()
  const dependencies = new Map<string, Set<string>>()
  const gameSystems: string[] = []

  const visit = (value: unknown, callback: (record: Record<string, unknown>) => void): void => {
    if (Array.isArray(value)) {
      value.forEach((entry) => visit(entry, callback))
      return
    }
    if (!value || typeof value !== 'object') return
    const record = value as Record<string, unknown>
    callback(record)
    Object.values(record).forEach((entry) => visit(entry, callback))
  }

  for (const { name, file } of files) {
    dependencies.set(name, new Set())
    if (file.gameSystem) gameSystems.push(name)
    visit(file, (record) => {
      if (typeof record.id === 'string') owners.set(record.id, name)
    })
  }

  for (const { name, file } of files) {
    const required = dependencies.get(name)!
    visit(file, (record) => {
      if (typeof record.targetId !== 'string') return
      const owner = owners.get(record.targetId)
      if (owner && owner !== name) required.add(owner)
    })
  }

  const partitions = new Map<string, string[]>()
  for (const { name, file } of files) {
    const catalogue = file.catalogue
    if (!catalogue || catalogue.library) continue
    const included = new Set([...gameSystems, name])
    const pending = [name]
    while (pending.length) {
      for (const dependency of dependencies.get(pending.pop()!) ?? []) {
        if (included.has(dependency)) continue
        included.add(dependency)
        pending.push(dependency)
      }
    }
    partitions.set(catalogue.id, [...included].toSorted())
  }
  return partitions
}
