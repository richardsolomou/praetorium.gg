import { expect, it } from 'vitest'
import { pluralModel, unitComposition, unitTransport } from './UnitFromVsData'

it('counts a unit’s models as a datasheet does', () => {
  const model = (name: string, min: number, max: number) => ({ name, min, max, wargear: [] })
  expect(
    unitComposition({
      sizes: [],
      options: [],
      models: [model('Immortal', 5, 10), model('Overlord', 1, 1), model('Canoptek Wraith', 3, 6)],
    }).map((line) => line.map((run) => run.text).join('')),
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

it('bolds the keywords a transport carries, as BSData prints them', () => {
  expect(
    unitTransport({
      sizes: [],
      models: [],
      options: [],
      transport: {
        loads: [[{ count: 'models', limit: 12, selectors: ['ASTRA MILITARUM INFANTRY'] }]],
        excluded: [{ selectors: ['ARTILLERY'] }],
      },
    }),
  ).toEqual([
    [{ text: 'Carries 12 ' }, { text: 'ASTRA MILITARUM INFANTRY', bold: true }, { text: ' models.' }],
    [{ text: 'Cannot carry ' }, { text: 'ARTILLERY', bold: true }, { text: ' models.' }],
  ])
})
