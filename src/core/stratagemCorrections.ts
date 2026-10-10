import type { Stratagem } from './battle'

export function correctStratagemTiming(stratagem: Stratagem): Stratagem {
  // Core rule 15.04 specifies Command; the pinned card tagged Charge, including in saved preparation.
  return stratagem.key === '55e8e302-c2a2-57fb-852d-a88fbb95f6c2' && stratagem.phases?.length === 1 && stratagem.phases[0] === 'charge'
    ? { ...stratagem, phases: ['command'] }
    : stratagem
}
