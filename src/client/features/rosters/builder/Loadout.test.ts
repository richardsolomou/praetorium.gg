import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Loadout } from './Loadout'
import { ModelCard } from './ModelCard'
import { EitherChoice, WargearRow } from './LoadoutControls'
import { WeaponSummary } from '../../../components/DatasheetProfiles'
import type { Datasheet } from '../../../../contracts/catalogue'
import { loadoutDatasheetsQuery } from '../../../queries'
import type { LoadoutUnit } from './loadoutModel'
import type { loadoutDatasheets } from '../../../../server/functions'

/** The loadout panel for a unit whose datasheet carries these profiles. */
function loadoutMarkup(unit: LoadoutUnit | null, profiles: Datasheet['profiles'] = [], loading = false) {
  const queryClient = new QueryClient()
  const picks = [{ entryId: unit?.entryId ?? 'unit' }]
  if (unit) {
    const sheet: Datasheet = {
      id: unit.entryId,
      slug: unit.entryId,
      referenceRoute: null,
      name: unit.name,
      points: unit.points,
      keywords: [],
      profiles,
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
      carriers: [],
      datacardJoin: 'missing',
    }
    queryClient.setQueryData(loadoutDatasheetsQuery('catalogue', unit.entryId, [], picks, 0).queryKey, data)
  }
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(Loadout, {
        catalogueId: 'catalogue',
        unit,
        loading,
        detachmentIds: [],
        picks,
        pickIndex: 0,
        onChoose: () => undefined,
        onSpread: () => undefined,
      }),
    ),
  )
}

it.each(['dual', 'gun'])('shows every bundle profile before choosing when %s is selected', (chosen) => {
  const markup = renderToStaticMarkup(
    createElement(EitherChoice, {
      choice: {
        key: 'weapons',
        name: 'Heavy weapons',
        chosen,
        optional: false,
        carried: false,
        room: 1,
        uniform: false,
        owner: null,
        options: [
          {
            id: 'dual',
            name: 'Dual fists + 2 Projectors',
            pieces: ['Dual fists', 'Projectors'],
            pieceCounts: [
              { name: 'Dual fists', count: 1 },
              { name: 'Projectors', count: 2 },
            ],
            count: chosen === 'dual' ? 1 : 0,
            points: 0,
            min: 0,
            max: 1,
          },
          {
            id: 'gun',
            name: 'Cannon + Fist + Projectors',
            pieces: ['Cannon', 'Fist', 'Projectors'],
            pieceCounts: [
              { name: 'Cannon', count: 1 },
              { name: 'Fist', count: 1 },
              { name: 'Projectors', count: 1 },
            ],
            count: chosen === 'gun' ? 1 : 0,
            points: 0,
            min: 0,
            max: 1,
          },
        ],
      },
      unitName: 'Walker',
      editable: true,
      onChoose: () => undefined,
      abilities: [],
      rules: [],
      weapons: ['Dual fists', 'Projectors', 'Cannon', 'Fist'].map((name) => ({
        id: name,
        name,
        type: 'Ranged Weapons',
        values: [
          { name: 'Range', value: '24"' },
          { name: 'A', value: name === 'Cannon' ? '12' : '3' },
        ],
      })),
    }),
  )
  expect(markup.match(/>Range</g)).toHaveLength(5)
  expect(markup).toContain('aria-label="Select Dual fists + 2 Projectors"')
  expect(markup).toContain('aria-label="Select Cannon + Fist + Projectors"')
  expect(markup).toContain('2× Projectors')
})

it.each([true, false])('offers one composition control when fixed sizes are %s', (fixedSizes) => {
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
  const markup = loadoutMarkup(unit)
  expect(markup).toContain('Select Vexilla')
  expect(markup.includes('Select 3 models')).toBe(!fixedSizes)
})

it('lists weapons a chosen bundle replaced among the equipped weapons of a unit without model cards', () => {
  const gun = (name: string, count: number) => ({ id: name, name, type: 'Ranged Weapons', count, values: [{ name: 'A', value: '6' }] })
  const unit: LoadoutUnit = {
    entryId: 'walker',
    name: 'Walker',
    points: 190,
    size: { min: 1, max: 1, models: 1, resizable: false },
    toggles: [],
    models: [],
    choices: [
      {
        key: 'cannons',
        name: 'Replace excruciator cannons',
        chosen: 'cannons',
        optional: false,
        carried: false,
        room: 1,
        uniform: false,
        owner: null,
        options: [
          {
            id: 'cannons',
            name: 'Two excruciator cannons',
            pieceCounts: [{ name: 'Excruciator cannon', count: 2 }],
            count: 1,
            points: 0,
            min: 0,
            max: 1,
          },
        ],
      },
    ],
  }
  const markup = loadoutMarkup(unit, [gun('Missile launcher', 1), gun('Excruciator cannon', 2)])
  const equipped = markup.slice(
    markup.indexOf('Equipped ranged weapons'),
    markup.indexOf('</section>', markup.indexOf('Equipped ranged weapons')),
  )
  expect(equipped).toContain('Excruciator cannon')
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
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
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
    ),
  )

  expect(markup).not.toContain('Blade and Rifle')
  expect(markup).toContain('>Blade</span>')
  expect(markup).toContain('>Rifle</span>')
})

it('keeps the weapons of an inactive customizable loadout in separate boxes', () => {
  const markup = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
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
    ),
  )

  expect(markup).not.toContain('Blade and Rifle')
  expect(markup).toContain('aria-label="More Blade"')
  expect(markup).toContain('aria-label="More Rifle"')
  expect(markup.match(/<li /g)).toHaveLength(3)
})

describe('loadout loading state', () => {
  it('does not ask for a selection while the selected unit is resolving', () => {
    const markup = loadoutMarkup(null, [], true)

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
