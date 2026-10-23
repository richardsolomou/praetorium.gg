/** Saved responses and queued drafts can predate admins, so parsing fills the list and components never see it missing. */
export function migrateSavedLeague(data: unknown, field: 'admins' | 'adminIds' = 'admins'): unknown {
  if (data && typeof data === 'object' && !Array.isArray(data) && !(field in data)) return { ...data, [field]: [] }
  return data
}
