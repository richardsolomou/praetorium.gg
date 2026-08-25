import type { Stratagem } from '../core/battle'
import type { RosterView } from '../core/battleView'
import { STRATAGEMS_MAX } from '../core/battle'

/**
 * What an army's rules are looked up by: the catalogue it was built from, and every
 * detachment it fields.
 *
 * Derived here and nowhere else. A caller that names the detachments differently is
 * a second cache key for the same six stratagems, and in a 2v1 it is worse than
 * wasteful: the side's pool would depend on which screen assembled it.
 */
export function armyRulesRequest(roster: RosterView | null | undefined): { catalogueId: string; detachmentNames: string[] } {
  const built = roster?.built
  return {
    catalogueId: built?.catalogueId ?? '',
    detachmentNames: built?.detachments?.map((detachment) => detachment.name) ?? (built?.detachment ? [built.detachment] : []),
  }
}

/**
 * The stratagems a side plays: every detachment on it, then the core cards once.
 *
 * A side is one pool, and in a 2v1 that pool is both armies — each ally brings its
 * own detachment to it, and reading only the seat the domain folds resources onto
 * left the other ally's six off every screen in the battle.
 *
 * Keyed by the dataset's own stratagem id, so two allies who happen to share a
 * detachment share its six rather than each getting a copy of them.
 */
export function sideStratagems(
  perArmy: readonly { detachments: readonly string[]; stratagems: readonly Stratagem[] }[],
  core: readonly Stratagem[],
): Stratagem[] {
  const found = new Map<string, Stratagem>()
  for (const army of perArmy) {
    // One name for the detachment a card came from, so the pool can group by it. An
    // army fielding several names them together rather than guessing between them.
    const detachment = army.detachments.join(' · ') || undefined
    for (const stratagem of army.stratagems) if (!found.has(stratagem.key)) found.set(stratagem.key, { ...stratagem, detachment })
  }
  for (const stratagem of core) if (!found.has(stratagem.key)) found.set(stratagem.key, stratagem)
  return [...found.values()].slice(0, STRATAGEMS_MAX)
}
