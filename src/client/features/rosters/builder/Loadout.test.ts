import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Loadout } from './Loadout'
import { ModelCard } from './ModelCard'
import { WargearRow } from './LoadoutControls'
import { WeaponSummary } from '../../../components/DatasheetProfiles'
import type { Datasheet } from '../../../../contracts/catalogue'
import { loadoutDatasheetsQuery } from '../../../queries'
import type { LoadoutUnit } from './loadoutModel'
import type { loadoutDatasheets } from '../../../../server/functions'

it.each([true, false])('offers one composition control when fixed sizes are %s', (fixedSizes) => {
  const queryClient = new QueryClient()
  const picks = [{ entryId: 'unit' }]
  const sheet: Datasheet = {
    id: 'unit',
    slug: 'unit',
    referenceRoute: null,
    name: 'Squad',
    points: 180,
    keywords: [],
    profiles: [],
    abilities: [],
    composition: [],
    loadout: null,
    wargearOptions: [],
    baseSize: null,
    transport: null,
    costs: [],
    attachments: [],
    leaders: [],
    supporters: [],
    keywordRules: [],
  }
  const data: NonNullable<Awaited<ReturnType<typeof loadoutDatasheets>>> = {
    selected: { ...sheet, detachments: [], attribution: null },
    available: { ...sheet, detachments: [], attribution: null },
    controlledChoices: [],
    carriers: [],
    datacardJoin: 'none',
  }
  queryClient.setQueryData(loadoutDatasheetsQuery('catalogue', 'unit', [], picks, 0).queryKey, data)
  const choice = (key: string, names: string[]) => ({
    key,
    name: key,
    chosen: names[0]!,
    optional: false,
    carried: false,
    room: 1,
    uniform: false,
    owner: null,
    options: names.map((name, index) => ({ id: name, name, count: index === 0 ? 1 : 0, points: 0, min: 0, max: 1 })),
  })
  const unit: LoadoutUnit = {
    entryId: 'unit',
    name: 'Squad',
    points: 180,
    size: { min: 2, max: 3, models: 2, resizable: true, ...(fixedSizes ? { options: [2, 3] } : {}) },
    toggles: [],
    models: [],
    choices: [choice('Unit Composition', ['2 models', '3 models']), choice('Vexilla', ['Vexilla'])],
  }
  const markup = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(Loadout, {
        catalogueId: 'catalogue',
        unit,
        detachmentIds: [],
        picks,
        pickIndex: 0,
        onChoose: () => undefined,
        onSpread: () => undefined,
      }),
    ),
  )
  expect(markup).toContain('Select Vexilla')
  expect(markup.includes('Select 3 models')).toBe(!fixedSizes)
})

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
