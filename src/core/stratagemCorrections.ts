import type { Stratagem } from './battle'

type Timing = Pick<Stratagem, 'limit' | 'phases' | 'turn'>

/**
 * Timing a Stratagem's typed source gets wrong, by key, the timing it was given and what the card says instead. Game
 * Datacards keys stay for battles saved with its cards; a VS Data key's correction goes once VS Data types the card as
 * its own summary describes it. `phases: undefined` in a correction means any phase.
 */
const CORRECTIONS: { key: string; given: Partial<Timing>; card: Partial<Timing> }[] = [
  // Usable once per battle, as both sources' cards say; neither types that limit.
  { key: '0f9b69bd-a7e0-5e3d-b3fc-d0440c30269c', given: { limit: 'phase' }, card: { limit: 'battle' } },
  { key: 'core.new-orders', given: { limit: 'phase' }, card: { limit: 'battle' } },
  // Core rule 15.04 specifies Command; the pinned card tagged Charge, including in saved preparation.
  { key: '55e8e302-c2a2-57fb-852d-a88fbb95f6c2', given: { phases: ['charge'] }, card: { phases: ['command'] } },
  // Printed "End of your Movement phase."; the pinned card tagged Fight in either turn, including in saved preparation.
  { key: '67b709ee-a1f7-5fc8-a373-560628694a49', given: { phases: ['fight'] }, card: { phases: ['movement'], turn: 'your-turn' } },
  { key: 'necrons.hand-of-the-dynasty.will-of-the-conqueror', given: { turn: 'either' }, card: { turn: 'your-turn' } },
  // Usable as any phase but the Command phase begins; VS Data types the Command phase alone.
  { key: 'imperial-agents.ordo-hereticus-purgation-force.stun-grenades', given: { phases: ['command'] }, card: { phases: undefined } },
  // VS Data's 2 September 2026 release types these against their own summaries.
  {
    key: 'space-marines.stormlance-task-force.wind-swift-evasion',
    given: { phases: ['movement'] },
    card: { phases: ['fight'], turn: 'either' },
  },
  {
    key: 'space-marines.ceramite-sentinels.augmented-targeting',
    given: { phases: ['shooting'] },
    card: { phases: ['shooting', 'fight'], turn: 'either' },
  },
  { key: 'space-marines.ceramite-sentinels.stand-to-the-end', given: { phases: ['fight'] }, card: { phases: ['shooting', 'fight'] } },
  { key: 'space-marines.shadowmark-talon.feint-and-thrust', given: { phases: ['movement'] }, card: { phases: ['command'] } },
]

const matches = (stratagem: Stratagem, given: Partial<Timing>) =>
  Object.entries(given).every(([field, value]) => JSON.stringify(stratagem[field as keyof Timing]) === JSON.stringify(value))

export function correctStratagemTiming(stratagem: Stratagem): Stratagem {
  const correction = CORRECTIONS.find((entry) => entry.key === stratagem.key && matches(stratagem, entry.given))
  if (!correction) return stratagem
  const corrected = { ...stratagem, ...correction.card }
  if (!corrected.phases) delete corrected.phases
  return corrected
}
