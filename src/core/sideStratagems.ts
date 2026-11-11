import type { Stratagem } from './battle'
import { STRATAGEMS_MAX } from './battle'
import { uniqueBy } from './collections'

/**
 * The stratagems a side plays: every detachment on it, then the core cards once.
 *
 * A side is one pool, and in a 2v1 that pool is both armies — each ally brings its
 * own detachment to it, so reading only the seat the domain folds resources onto
 * would leave the other ally's six off every screen in the battle.
 *
 * Keyed by the dataset's own stratagem id, so two allies who happen to share a
 * detachment share its six rather than each getting a copy of them.
 */
export function sideStratagems(
  perArmy: readonly { detachments: readonly string[]; stratagems: readonly Stratagem[] }[],
  core: readonly Stratagem[],
): Stratagem[] {
  const detachmentCards = perArmy.flatMap((army) => {
    // One name for the detachment a card came from, so the pool can group by it. An
    // army fielding several names them together rather than guessing between them.
    const detachment = army.detachments.join(' · ') || undefined
    return army.stratagems.map((stratagem) => ({ ...stratagem, detachment }))
  })
  return uniqueBy([...detachmentCards, ...core], (stratagem) => stratagem.key).slice(0, STRATAGEMS_MAX)
}
