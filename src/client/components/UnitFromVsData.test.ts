import { expect, it } from 'vitest'
import { unitLoadout, unitOption, unitTransport } from './UnitFromVsData'

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

it('counts one model of an allowance in the singular', () => {
  expect(
    unitTransport({
      sizes: [],
      models: [],
      options: [],
      transport: { loads: [[{ count: 'models', limit: 1, selectors: ['DREADNOUGHT'] }]] },
    })[0],
  ).toEqual([{ text: 'Carries 1 ' }, { text: 'DREADNOUGHT', bold: true }, { text: ' model.' }])
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

it('separates choices with semicolons when one names several pieces of wargear', () => {
  expect(
    unitOption({ carrier: 'Missionary', choose: { min: 0, max: 1 }, choices: ['Meltagun', 'Holy fire and Plasma gun', 'Plasma gun'] })[0],
  ).toEqual({ paragraph: [{ text: 'Each Missionary can take Meltagun; Holy fire and Plasma gun; or Plasma gun.' }] })
})

it('says a model takes a choice it must make', () => {
  expect(unitOption({ carrier: 'Gun Servitor', choose: { min: 1, max: 1 }, choices: ['Heavy bolter', 'Heavy arc rifle'] })[0]).toEqual({
    paragraph: [{ text: 'Each Gun Servitor takes Heavy bolter or Heavy arc rifle.' }],
  })
})

it('says how many of a model line start with each choice where its models differ', () => {
  expect(
    unitLoadout({
      sizes: [9],
      models: [{ name: 'Gun Servitor', min: 2, max: 2, wargear: [['Servo-claw', 1]] }],
      options: [
        {
          carrier: 'Gun Servitor',
          choose: { min: 1, max: 1 },
          choices: ['Heavy bolter', 'Heavy arc rifle'],
          defaults: [
            ['Heavy arc rifle', 1],
            ['Heavy bolter', 1],
          ],
        },
      ],
    }).map((line) => line.map((run) => run.text).join('')),
  ).toEqual(['Gun Servitor: Servo-claw.', 'Of the Gun Servitor models, 1 starts with Heavy arc rifle and 1 with Heavy bolter.'])
})
