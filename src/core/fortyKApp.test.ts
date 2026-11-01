import { expect, it } from 'vitest'
import { fromFortyKAppText } from './fortyKApp'

it('reads a support-only unit, a note, and a grouped unit that lost its letter', () => {
  const parsed = fromFortyKAppText(`Notes
Necrons · Cursed Legion
Mission: Purge the Foe
360/1000 pts

ATTACHED UNIT A [145 pts]
  Technomancer [80 pts]
    Staff of light
  Immortals [65 pts] (5 models)
    5× Gauss blaster

BATTLELINE [215 pts]
  Immortals B [65 pts] (5 models)
    5× Tesla carbine
    Hold the middle
  Canoptek Wraiths [150 pts] (3 models)
    Supported by Technomancer
    3× Vargard claws

Exported from 40k.app, view the full list here:
https://www.40k.app/lists/example`)

  expect(parsed?.units.map((unit) => [unit.name, unit.entry, unit.attachedToEntry, unit.note])).toEqual([
    ['Technomancer', undefined, 1, undefined],
    ['Immortals', 1, undefined, undefined],
    ['Immortals', undefined, undefined, 'Hold the middle'],
    ['Canoptek Wraiths', undefined, undefined, undefined],
  ])
})

it('reads the Markdown table export as the text one', () => {
  const parsed = fromFortyKAppText(`# Table

Necrons · Cursed Legion

Mission: Purge the Foe

**155/1000 pts**

| **Leaders & Characters** [90 pts] | |
|:--|:--|
| **Overlord** (90 pts) — Warlord | Attached to Immortals |
| | **Enhancement:** Destroyer Ankh (+20 pts) |
| | Staff of light |

| **Battleline** [65 pts] | |
|:--|:--|
| **Immortals** (65 pts, 5 models) | Led by Overlord |
| | 5× Tesla carbine |

*Exported from [40k.app](https://40k.app), view the full list [here](https://www.40k.app/lists/example)*`)

  expect(parsed?.units).toEqual([
    {
      name: 'Overlord',
      models: 1,
      selections: [
        { name: 'Enhancement: Destroyer Ankh', count: 1 },
        { name: 'Staff of light', count: 1 },
      ],
      leading: null,
      warlord: true,
      attachedToEntry: 1,
    },
    { name: 'Immortals', models: 5, selections: [{ name: 'Tesla carbine', count: 5 }], leading: null, warlord: false, entry: 1 },
  ])
})
