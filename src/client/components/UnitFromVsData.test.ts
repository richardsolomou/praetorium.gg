import { expect, it } from 'vitest'
import { pluralModel, unitComposition, unitOption, unitTransport } from './UnitFromVsData'

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

it('lists the limits on an option’s choices under what the option allows', () => {
  expect(
    unitOption({
      carrier: 'Nob',
      choose: { min: 0, max: 1 },
      choices: ['Big Choppa', 'Power Klaw'],
      replaces: [['Choppa', 1]],
      caps: [{ choices: ['Power Klaw'], max: 1, perModels: 5 }],
    }),
  ).toEqual([
    { paragraph: [{ text: 'Each Nob can take Big Choppa or Power Klaw in place of Choppa.' }] },
    { list: 'unordered', items: [[{ text: 'At most 1 Power Klaw for every 5 models.' }]] },
  ])
})
