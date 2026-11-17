// Apart from the rules-version migrations, whose tables the device's saved-work parser does not need.
function omitRetired(value: unknown, field: string): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !(field in value)) return value
  const { [field]: _retired, ...rest } = value as Record<string, unknown>
  return rest
}

export function migrateSavedRoster(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const roster = value as Record<string, unknown>
  return {
    ...roster,
    ...('prep' in roster ? { prep: omitRetired(roster.prep, 'shareNotes') } : {}),
  }
}
