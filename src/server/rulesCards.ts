import fs from 'node:fs'
import path from 'node:path'
import type { Stratagem } from '../core/battle'
import { localizedField, stratagemLimit, stratagemText } from './datacards'
import { type LoadedCards } from '../shared/rulesCards'
export * from '../shared/rulesCards'
export function coreFromDatacards(directory: string): Pick<LoadedCards, 'core' | 'coreDetails'> {
  const file = path.join(directory, 'core.json')
  if (!fs.existsSync(file)) return { core: [], coreDetails: [] }
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { stratagems?: Record<string, unknown>[] }
  const core: Stratagem[] = []
  const coreDetails: LoadedCards['coreDetails'] = []
  for (const card of parsed.stratagems ?? []) {
    const name = localizedField(card, 'name')
    if (typeof card.id !== 'string' || !name || !Number.isInteger(card.cost)) continue
    const phases = Array.isArray(card.phase)
      ? card.phase.filter(
          (phase): phase is NonNullable<Stratagem['phases']>[number] =>
            typeof phase === 'string' && ['command', 'movement', 'shooting', 'charge', 'fight', 'end'].includes(phase),
        )
      : []
    const turn =
      card.turn === 'your' ? 'your-turn' : card.turn === 'opponents' ? 'opponent-turn' : card.turn === 'either' ? 'either' : undefined
    core.push({
      key: card.id,
      name,
      cp: card.cost as number,
      limit: stratagemLimit(localizedField(card, 'restrictions')),
      ...(phases.length ? { phases } : {}),
      ...(turn ? { turn } : {}),
    })
    const description = stratagemText(card)
    if (description) coreDetails.push({ id: card.id, type: typeof card.type === 'string' ? card.type : null, description })
  }
  return { core, coreDetails }
}
