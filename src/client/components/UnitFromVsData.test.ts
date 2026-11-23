import { expect, it } from 'vitest'
import { pluralModel, unitComposition } from './UnitFromVsData'

it('counts a unit’s models as a datasheet does', () => {
  const model = (name: string, min: number, max: number) => ({ name, min, max, wargear: [] })
  expect(
    unitComposition({
      sizes: [],
      options: [],
      models: [model('Immortal', 5, 10), model('Overlord', 1, 1), model('Canoptek Wraith', 3, 6)],
    }),
  ).toEqual(['5–10 Immortals', '1 Overlord', '3–6 Canoptek Wraiths'])
})

it('writes a model’s plural as English does', () => {
  expect(
    [
      'Ork Boy',
      'Battle Sister',
      'Kroot Carnivore',
      'Grey Knight Brother',
      'Ogryn Bodyguard',
      'Rifleman',
      'Lictor Swarm',
      'Scout Sentry',
    ].map(pluralModel),
  ).toEqual([
    'Ork Boys',
    'Battle Sisters',
    'Kroot Carnivores',
    'Grey Knight Brothers',
    'Ogryn Bodyguards',
    'Riflemen',
    'Lictor Swarms',
    'Scout Sentries',
  ])
})
