import { type Phase, PHASES, type Stratagem } from '../core/battle'
import { canonicalDetachmentName } from '../core/detachmentName'
import { routeSlug } from '../core/slug'
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
/** VS Data's phase as a turn ends is the battle's end phase. */
const phaseOf = (phase: VsDataStratagem['phases'][number]): Phase => (phase === 'end-of-turn' ? 'end' : phase)

function cardOf(stratagem: VsDataStratagem): VsStratagemCard {
  const phases = stratagem.phases.map(phaseOf)
  const timing: Stratagem = {
    key: stratagem.id,
    name: stratagem.name,
    cp: stratagem.cp,
    // The core rules' limit, which a Stratagem's typed facts leave out only when it says nothing else.
    limit: stratagem.limit ?? 'phase',
    ...(phases.length < PHASES.length ? { phases } : {}),
    turn: TURNS[stratagem.turn],
    ...(stratagem.windows ? { windows: stratagem.windows.map(({ phase, turn }) => ({ phase: phaseOf(phase), turn: TURNS[turn] })) } : {}),
  }
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
