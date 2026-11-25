import type { Stratagem } from './battle'

type Timing = Pick<Stratagem, 'limit' | 'phases' | 'turn'>

/** Timing the Game Datacards cards saved battles hold got wrong, by key: the timing it was given and what the card says. */
const CORRECTIONS: { key: string; given: Partial<Timing>; card: Partial<Timing> }[] = [
  // Usable once per battle, as the card says; the pinned card typed no limit, including in saved preparation.
  { key: '0f9b69bd-a7e0-5e3d-b3fc-d0440c30269c', given: { limit: 'phase' }, card: { limit: 'battle' } },
  // Core rule 15.04 specifies Command; the pinned card tagged Charge, including in saved preparation.
  { key: '55e8e302-c2a2-57fb-852d-a88fbb95f6c2', given: { phases: ['charge'] }, card: { phases: ['command'] } },
  // Printed "End of your Movement phase."; the pinned card tagged Fight in either turn, including in saved preparation.
  { key: '67b709ee-a1f7-5fc8-a373-560628694a49', given: { phases: ['fight'] }, card: { phases: ['movement'], turn: 'your-turn' } },
]

const matches = (stratagem: Stratagem, given: Partial<Timing>) =>
  Object.entries(given).every(([field, value]) => JSON.stringify(stratagem[field as keyof Timing]) === JSON.stringify(value))

export function correctStratagemTiming(stratagem: Stratagem): Stratagem {
  const correction = CORRECTIONS.find((entry) => entry.key === stratagem.key && matches(stratagem, entry.given))
  if (!correction) return stratagem
  return { ...stratagem, ...correction.card }
}
