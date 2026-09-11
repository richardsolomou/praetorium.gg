import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Loadout } from './Loadout'
import { ModelCard } from './ModelCard'
import { WargearRow } from './LoadoutControls'
import { WeaponSummary } from './DatasheetPanel'

it('groups firing profiles under one weapon within a paired loadout', () => {
  const markup = renderToStaticMarkup(
    createElement(WargearRow, {
      name: 'Blade and Blaster',
      pieces: ['Blade', 'Blaster'],
      count: 1,
      abilities: [],
      rules: [],
      weapons: ['Blade', '➤ Blaster - Focused', '➤ Blaster - Dispersed'].map((name) => ({
        id: name,
        name,
        type: 'Ranged Weapons',
        values: [{ name: 'A', value: '2' }],
      })),
    }),
  )
  expect(markup).toContain('aria-label="blaster profiles"')
  expect(markup).toContain('2 profiles')
  expect(markup).toContain('Focused')
  expect(markup).toContain('Dispersed')
  expect(markup).not.toContain('aria-label="blade profiles"')
})

it('keeps loadout weapon stats visible without a collapse control', () => {
  const markup = renderToStaticMarkup(
    createElement(WargearRow, {
      name: 'Rifle',
      count: 1,
      abilities: [],
      rules: [],
      weapons: [{ id: 'rifle', name: 'Rifle', type: 'Ranged Weapons', values: [{ name: 'Range', value: '24"' }] }],
    }),
  )

  expect(markup).toContain('Range')
  expect(markup).not.toContain('aria-expanded')
  expect(markup).not.toContain('hidden=""')
})

it('omits a loadout container when its nested choices already control every piece', () => {
  const markup = renderToStaticMarkup(
    createElement(ModelCard, {
      model: {
        name: 'Leader',
        fixed: [],
        members: [{ id: 'leader', choiceKey: null, baseCount: 1 }],
        rows: [
          { name: 'Blade and Rifle', pieces: ['Blade', 'Rifle'], choiceKey: 'weapons', optionId: 'pair' },
          { name: 'Blade', choiceKey: 'weapons/pair/melee', optionId: 'blade' },
          { name: 'Rifle', choiceKey: 'weapons/pair/ranged', optionId: 'rifle' },
        ],
      },
      choices: [
        { key: 'weapons', id: 'pair', name: 'Blade and Rifle' },
        { key: 'weapons/pair/melee', id: 'blade', name: 'Blade' },
        { key: 'weapons/pair/ranged', id: 'rifle', name: 'Rifle' },
      ].map(({ key, id, name }) => ({
        key,
        name,
        chosen: id,
        optional: false,
        carried: false,
        room: 1,
        uniform: false,
        owner: null,
        options: [{ id, name, count: 1, points: 0, min: 0, max: 1 }],
      })),
      stands: null,
      weapons: [],
      abilities: [],
      rules: [],
      editable: true,
      onChoose: () => undefined,
      onSpread: () => undefined,
    }),
  )

  expect(markup).not.toContain('Blade and Rifle')
  expect(markup).toContain('>Blade</span>')
  expect(markup).toContain('>Rifle</span>')
})

it('keeps the weapons of an inactive customizable loadout in separate boxes', () => {
  const markup = renderToStaticMarkup(
    createElement(ModelCard, {
      model: {
        name: 'Leader',
        fixed: [],
        members: [{ id: 'leader', choiceKey: null, baseCount: 1 }],
        rows: [
          { name: 'Blade and Rifle', pieces: ['Blade', 'Rifle'], separatePieces: true, choiceKey: 'weapons', optionId: 'pair' },
          { name: 'Great axe', choiceKey: 'weapons', optionId: 'axe' },
        ],
      },
      choices: [
        {
          key: 'weapons',
          name: 'Weapons',
          chosen: 'axe',
          optional: false,
          carried: false,
          room: 1,
          uniform: false,
          owner: { id: 'leader', name: 'Leader', profile: null },
          options: [
            { id: 'pair', name: 'Blade and Rifle', count: 0, points: 0, min: 0, max: 1, default: true },
            { id: 'axe', name: 'Great axe', count: 1, points: 0, min: 0, max: 1 },
          ],
        },
      ],
      stands: null,
      weapons: [],
      abilities: [],
      rules: [],
      editable: true,
      onChoose: () => undefined,
      onSpread: () => undefined,
    }),
  )

  expect(markup).not.toContain('Blade and Rifle')
  expect(markup).toContain('aria-label="More Blade"')
  expect(markup).toContain('aria-label="More Rifle"')
  expect(markup.match(/<li /g)).toHaveLength(3)
})

describe('loadout loading state', () => {
  it('does not ask for a selection while the selected unit is resolving', () => {
    const queryClient = new QueryClient()
    const markup = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(Loadout, {
          catalogueId: 'catalogue',
          unit: null,
          loading: true,
          detachmentIds: [],
          picks: [{ entryId: 'unit' }],
          pickIndex: 0,
          onChoose: () => undefined,
          onSpread: () => undefined,
        }),
      ),
    )

    expect(markup).toContain('aria-label="Loading loadout"')
    expect(markup).not.toContain('Select a unit from the roster')
  })
})

it('counts a carried weapon once when it has alternate profiles', () => {
  const markup = renderToStaticMarkup(
    createElement(WeaponSummary, {
      title: 'Ranged weapons',
      rules: [],
      weapons: ['➤ Blaster - Focused', '➤ Blaster - Dispersed'].map((name) => ({
        id: name,
        name,
        count: 2,
        type: 'Ranged Weapons',
        values: [],
      })),
    }),
  )
  expect(markup).toContain('<span class="readout text-faint">2</span>')
})
