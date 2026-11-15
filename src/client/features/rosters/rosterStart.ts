import { searchFlag } from '../../searchParams'

export type MissionReference = 'mission-pack' | 'mission-matchup'

export function rosterStartSearch(search: Record<string, unknown>): { new?: true; reference?: MissionReference; import?: true } {
  if (searchFlag(search.import)) return { import: true }
  if (!searchFlag(search.new)) return {}
  const reference = search.reference === 'mission-pack' || search.reference === 'mission-matchup' ? search.reference : undefined
  return { new: true, ...(reference ? { reference } : {}) }
}
