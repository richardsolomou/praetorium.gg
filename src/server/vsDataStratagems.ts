import type { Stratagem } from '../core/battle'
import { canonicalDetachmentName } from '../core/detachmentName'
import { routeSlug } from '../core/slug'
import { correctStratagemTiming } from '../core/stratagemCorrections'
import type { VsDataStratagem } from '../shared/vsData'

/** A Stratagem as the battle rules and reference pages read it: its timing, and the type a card is labelled with. */
export type VsStratagemCard = Stratagem & { type: string | null }

const TURNS = { own: 'your-turn', opponent: 'opponent-turn', any: 'either' } as const
const TYPES = {
  'battle-tactic': 'Battle Tactic',
  'strategic-ploy': 'Strategic Ploy',
  'epic-deed': 'Epic Deed',
  wargear: 'Wargear',
} as const
/** VS Data names a Stratagem usable in any phase by listing all five it can name, which leaves out the end of a turn. */
const ANY_PHASE = 5

function cardOf(stratagem: VsDataStratagem): VsStratagemCard {
  const timing = correctStratagemTiming({
    key: stratagem.id,
    name: stratagem.name,
    cp: stratagem.cp,
    // The core rules' limit, which a Stratagem's typed facts leave out only when it says nothing else.
    limit: stratagem.limit ?? 'phase',
    ...(stratagem.phases.length < ANY_PHASE ? { phases: stratagem.phases } : {}),
    turn: TURNS[stratagem.turn],
  })
  const type = stratagem.type ? TYPES[stratagem.type] : stratagem.detachment === null ? 'Core Stratagem' : null
  return { ...timing, type }
}

/** The Stratagems of a VS Data release: each Detachment's by its name's slug, and the core ones every army has. */
export function vsDataStratagems(stratagems: readonly VsDataStratagem[]) {
  const byDetachment = new Map<string, VsStratagemCard[]>()
  const core: VsStratagemCard[] = []
  for (const stratagem of stratagems) {
    const card = cardOf(stratagem)
    if (stratagem.detachment === null) core.push(card)
    else {
      const slug = routeSlug(canonicalDetachmentName(stratagem.detachment))
      byDetachment.set(slug, [...(byDetachment.get(slug) ?? []), card])
    }
  }
  return { inDetachment: (name: string) => byDetachment.get(routeSlug(canonicalDetachmentName(name))) ?? [], core }
}
