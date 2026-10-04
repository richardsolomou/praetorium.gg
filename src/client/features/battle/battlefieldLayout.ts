import type { TerrainLayout } from '../../../contracts/terrain'
import { compareText } from '../../../core/text'

const legacyDispositions: Record<string, string> = {
  assets: 'priority-assets',
  disrupt: 'disruption',
  purge: 'purge-the-foe',
  recon: 'reconnaissance',
  take: 'take-and-hold',
}

export function battlefieldLayout(id: string | null, layouts: readonly TerrainLayout[] = []): TerrainLayout | null {
  const exact = layouts.find((layout) => layout.id === id)
  if (exact) return exact
  const legacy = /^bm-(assets|disrupt|purge|recon|take)-vs-(assets|disrupt|purge|recon|take)-0([123])$/.exec(id ?? '')
  if (!legacy) return null
  const matchup = [legacyDispositions[legacy[1]!]!, legacyDispositions[legacy[2]!]!].sort(compareText).join('|')
  const matches = layouts.filter(
    (layout) => layout.variant === Number(legacy[3]) && layout.matchupId.split('-vs-').sort(compareText).join('|') === matchup,
  )
  return matches.length === 1 ? matches[0]! : null
}
