import type { Stratagem } from './battle'

export function correctStratagemTiming(stratagem: Stratagem): Stratagem {
  if (stratagem.key === '0f9b69bd-a7e0-5e3d-b3fc-d0440c30269c' && stratagem.limit === 'phase') return { ...stratagem, limit: 'battle' }
  // Core rule 15.04 specifies Command; the pinned card tagged Charge, including in saved preparation.
  return stratagem.key === '55e8e302-c2a2-57fb-852d-a88fbb95f6c2' && stratagem.phases?.length === 1 && stratagem.phases[0] === 'charge'
    ? { ...stratagem, phases: ['command'] }
    : stratagem
}
