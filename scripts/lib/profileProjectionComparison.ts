type Sheet = {
  catalogueId: string
  id: string
  faction: string
  name: string
  profiles: { id: string; name: string; values: { name: string; value: string }[] }[]
}

type ProfileSnapshot = { datasheets: Sheet[] }

export type ProfileChange = {
  catalogueId: string
  faction: string
  datasheet: string
  profile: string
  characteristic: string
  before: string | null
  after: string | null
}

export type SheetIdentityChange = {
  kind: 'added' | 'removed'
  catalogueId: string
  faction: string
  datasheet: string
}

export function compareSheetIdentities(before: ProfileSnapshot, after: ProfileSnapshot) {
  const identity = (sheet: Sheet) => `${sheet.catalogueId}/${sheet.id}`
  const earlier = new Set(before.datasheets.map(identity))
  const current = new Set(after.datasheets.map(identity))
  return [
    ...before.datasheets
      .filter((sheet) => !current.has(identity(sheet)))
      .map((sheet): SheetIdentityChange => ({
        kind: 'removed',
        catalogueId: sheet.catalogueId,
        faction: sheet.faction,
        datasheet: sheet.name,
      })),
    ...after.datasheets
      .filter((sheet) => !earlier.has(identity(sheet)))
      .map((sheet): SheetIdentityChange => ({
        kind: 'added',
        catalogueId: sheet.catalogueId,
        faction: sheet.faction,
        datasheet: sheet.name,
      })),
  ].toSorted(
    (left, right) =>
      left.faction.localeCompare(right.faction) || left.datasheet.localeCompare(right.datasheet) || left.kind.localeCompare(right.kind),
  )
}

function valuesOf(sheet: Sheet) {
  const values = new Map<string, { profile: string; characteristic: string; values: string[] }>()
  for (const profile of sheet.profiles) {
    for (const characteristic of profile.values) {
      const key = JSON.stringify([profile.id, profile.name, characteristic.name])
      const existing = values.get(key)
      if (existing) existing.values.push(characteristic.value)
      else values.set(key, { profile: profile.name, characteristic: characteristic.name, values: [characteristic.value] })
    }
  }
  for (const entry of values.values()) entry.values.sort()
  return values
}

export function compareProfiles(before: ProfileSnapshot, after: ProfileSnapshot) {
  const earlier = new Map(before.datasheets.map((sheet) => [`${sheet.catalogueId}/${sheet.id}`, sheet]))
  const changes: ProfileChange[] = []
  for (const sheet of after.datasheets) {
    const previous = earlier.get(`${sheet.catalogueId}/${sheet.id}`)
    if (!previous) continue
    const oldValues = valuesOf(previous)
    const newValues = valuesOf(sheet)
    for (const key of new Set([...oldValues.keys(), ...newValues.keys()])) {
      const oldValue = oldValues.get(key)
      const newValue = newValues.get(key)
      for (let position = 0; position < Math.max(oldValue?.values.length ?? 0, newValue?.values.length ?? 0); position++) {
        const oldText = oldValue?.values[position] ?? null
        const newText = newValue?.values[position] ?? null
        if (oldText === newText) continue
        changes.push({
          catalogueId: sheet.catalogueId,
          faction: sheet.faction,
          datasheet: sheet.name,
          profile: newValue?.profile ?? oldValue!.profile,
          characteristic: newValue?.characteristic ?? oldValue!.characteristic,
          before: oldText,
          after: newText,
        })
      }
    }
  }
  return changes.toSorted(
    (left, right) =>
      left.faction.localeCompare(right.faction) ||
      left.datasheet.localeCompare(right.datasheet) ||
      left.profile.localeCompare(right.profile) ||
      left.characteristic.localeCompare(right.characteristic),
  )
}

export function profileChangesOutside(changes: readonly ProfileChange[], allowedCatalogueIds: ReadonlySet<string>) {
  return changes.filter((change) => !allowedCatalogueIds.has(change.catalogueId))
}
