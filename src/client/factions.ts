export function factionFor<T extends { id: string; slug: string }>(data: { factions: T[] } | null | undefined, param: string) {
  return data?.factions.find((faction) => faction.slug === param || faction.id === param)
}
