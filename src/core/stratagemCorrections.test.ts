import { expect, it } from 'vitest'
import type { Stratagem } from './battle'
import { correctStratagemTiming } from './stratagemCorrections'

const bravery: Stratagem = {
  key: '55e8e302-c2a2-57fb-852d-a88fbb95f6c2',
  name: 'Insane Bravery',
  cp: 1,
  limit: 'battle',
  phases: ['charge'],
  turn: 'your-turn',
}

it.each([
  { ...bravery, key: 'other-card' },
  { ...bravery, phases: ['movement'] },
  { ...bravery, phases: ['charge', 'fight'] },
  { ...bravery, phases: undefined },
] satisfies Stratagem[])('preserves cards outside the verified correction: %j', (stratagem) => {
  expect(correctStratagemTiming(stratagem)).toBe(stratagem)
})

it('leaves corrected source timing unchanged', () => {
  const corrected = correctStratagemTiming(bravery)
  expect(correctStratagemTiming(corrected)).toBe(corrected)
})

it('corrects only the missing battle restriction on the source New Orders card', () => {
  const stratagem: Stratagem = {
    key: '0f9b69bd-a7e0-5e3d-b3fc-d0440c30269c',
    name: 'New Orders',
    cp: 1,
    limit: 'phase',
    phases: ['command'],
    turn: 'your-turn',
  }
  expect(correctStratagemTiming(stratagem)).toEqual({ ...stratagem, limit: 'battle' })
})
