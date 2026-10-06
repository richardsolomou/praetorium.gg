import { describe, expect, it } from 'vitest'
import { buildIndex } from './catalogue'
import { combatCarriers } from './combatLoadout'
import { combatPlan } from './combatProfiles'
import { loadoutSheet, optimizeLoadout, type LoadoutScoring } from './combatLoadouts'
import { DEFAULT_COMBAT_OPTIONS } from './combat'
import type { Datasheet } from './datasheet'
import type { Selection } from './evaluate'

const index = buildIndex(
  [
    {
      catalogue: {
        id: 'catalogue',
        name: 'Catalogue',
        costTypes: [{ id: 'pts', name: 'pts' }],
        selectionEntries: [
          {
            id: 'unit',
            name: 'Squad',
            type: 'unit',
            selectionEntries: [
              { id: 'leader', name: 'Leader', type: 'model', selectionEntries: [{ id: 'fist', name: 'Fist', type: 'upgrade' }] },
              {
                id: 'trooper',
                name: 'Trooper',
                type: 'model',
                selectionEntries: [
                  { id: 'rifle', name: 'Rifle', type: 'upgrade', collective: true },
                  { id: 'blade', name: 'Blade', type: 'upgrade' },
                ],
              },
            ],
          },
          { id: 'tank', name: 'Tank', type: 'unit', selectionEntries: [{ id: 'cannon', name: 'Cannon', type: 'upgrade' }] },
        ],
      },
    },
  ],
  'test',
)

describe('combat weapon ownership', () => {
  it('keeps specialists separate and respects pooled and per-model counts', () => {
    expect(
      combatCarriers(
        {
          id: 'unit',
          selections: [
            { id: 'leader', count: 1, selections: [{ id: 'fist' }] },
            { id: 'trooper', count: 4, selections: [{ id: 'rifle', count: 4 }, { id: 'blade' }] },
          ],
        },
        index,
      ),
    ).toEqual([
      { name: 'Leader', models: 1, weapons: [{ name: 'Fist', count: 1 }] },
      {
        name: 'Trooper',
        models: 4,
        weapons: [
          { name: 'Rifle', count: 4 },
          { name: 'Blade', count: 4 },
        ],
      },
    ])
  })
  it('treats a unit without model children as one model', () => {
    expect(combatCarriers({ id: 'tank', selections: [{ id: 'cannon', count: 2 }] }, index)).toEqual([
      { name: 'Tank', models: 1, weapons: [{ name: 'Cannon', count: 2 }] },
    ])
  })
  it('does not count removed models', () => {
    expect(
      combatCarriers(
        {
          id: 'unit',
          selections: [
            { id: 'leader', count: 0, selections: [{ id: 'fist' }] },
            { id: 'trooper', selections: [{ id: 'blade' }] },
          ],
        },
        index,
      ).map((carrier) => carrier.name),
    ).toEqual(['Trooper'])
  })
})

describe('exclusive squad weapon choices', () => {
  const profile = (name: string) => ({
    id: name,
    name,
    typeName: 'Melee Weapons',
    characteristics: Object.entries({ A: '1', WS: '2+', S: '6', AP: '-2', D: '2', Keywords: '-' }).map(([characteristic, $text]) => ({
      name: characteristic,
      typeId: characteristic,
      $text,
    })),
  })
  const book = (maximum = 1) =>
    buildIndex(
      [
        {
          catalogue: {
            id: 'catalogue',
            name: 'Catalogue',
            costTypes: [{ id: 'pts', name: 'pts' }],
            selectionEntries: [
              {
                id: 'unit',
                name: 'Squad',
                type: 'unit',
                selectionEntries: [
                  {
                    id: 'model',
                    name: 'Trooper',
                    type: 'model',
                    selectionEntries: [{ id: 'Pistol', name: 'Pistol', type: 'upgrade', collective: true, profiles: [profile('Pistol')] }],
                    selectionEntryGroups: [
                      {
                        id: 'weapons',
                        name: 'Weapons',
                        constraints: [{ id: 'maximum', type: 'max', field: 'selections', scope: 'parent', value: 1 }],
                        ...(maximum !== 1 ? { modifiers: [{ type: 'set', field: 'maximum', value: maximum }] } : {}),
                        selectionEntries: ['Mace', 'Sword'].map((name) => ({
                          id: name,
                          name,
                          type: 'upgrade',
                          collective: true,
                          profiles: [profile(name)],
                        })),
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      ],
      'test',
    )
  const selection = (maces: number, swords: number): Selection => ({
    id: 'unit',
    selections: [
      {
        id: 'model',
        count: 4,
        selections: [
          {
            id: 'weapons',
            selections: [
              { id: 'Mace', count: maces },
              { id: 'Sword', count: swords },
            ],
          },
        ],
      },
    ],
  })
  const weapons = ['Mace', 'Sword'].map((name) => ({
    id: name,
    name,
    type: 'Melee Weapons',
    values: profile(name).characteristics.map(({ name: characteristic, $text }) => ({ name: characteristic, value: $text })),
  }))
  const sheet = { profiles: [], keywords: [], abilities: [], keywordRules: [] } as unknown as Datasheet
  const attack = (maces: number, swords: number, maximum = 1) => {
    const carriers = combatCarriers(selection(maces, swords), book(maximum))
    return combatPlan(loadoutSheet(sheet, weapons, carriers), carriers, [], 'melee')
  }
  it('attacks with both weapons when each model chooses exactly one', () => {
    expect(attack(3, 1).active.map(({ profile: weapon, count }) => [weapon.name, count])).toEqual([
      ['Mace', 3],
      ['Sword', 1],
    ])
  })
  it('accepts every complete allocation of the exclusive choice', () => {
    expect([0, 1, 2, 3, 4].map((maces) => attack(maces, 4 - maces).errors)).toEqual([[], [], [], [], []])
  })
  it('refuses overlapping ownership when a modifier permits two weapons per model', () => {
    expect(attack(2, 2, 2).errors).toEqual(['Trooper: melee allocation needs individual model ownership.'])
  })
  it('refuses an incomplete allocation', () => {
    expect(attack(1, 1).errors).toEqual(['Trooper: melee allocation needs individual model ownership.'])
  })
  it('distributes shared collective equipment without duplicating it', () => {
    const selected = selection(3, 1)
    selected.selections = selected.selections!.map((model) => ({
      ...model,
      selections: [...model.selections!, { id: 'Pistol', count: 4 }],
    }))
    expect(
      combatCarriers(selected, book()).map(({ models, weapons: carried }) => ({
        models,
        pistol: carried.find((weapon) => weapon.name === 'Pistol')?.count,
      })),
    ).toEqual([
      { models: 3, pistol: 3 },
      { models: 1, pistol: 1 },
    ])
  })
  it('keeps independent partial equipment ambiguous', () => {
    const selected = selection(3, 1)
    selected.selections = selected.selections!.map((model) => ({
      ...model,
      selections: [...model.selections!, { id: 'Pistol', count: 1 }],
    }))
    expect(combatCarriers(selected, book()).map(({ models }) => models)).toEqual([4])
  })
  it('optimizes all mixed allocations without dropping either weapon', () => {
    const target = { groups: [{ models: 1, toughness: 4, save: 3, wounds: 10, invulnerable: null }], feelNoPain: null }
    const scoring: LoadoutScoring = {
      sheet,
      models: 4,
      rules: [],
      opponent: { keywords: [], rules: [] },
      preferences: {},
      excluded: { ranged: [], melee: [] },
      phases: {
        ranged: { target, options: DEFAULT_COMBAT_OPTIONS, adjustment: {} },
        melee: { target, options: { ...DEFAULT_COMBAT_OPTIONS, phase: 'melee' }, adjustment: {} },
      },
    }
    expect(
      optimizeLoadout(
        {
          candidates: [0, 1, 2, 3, 4].map((maces) => ({
            members: [
              {
                pickIndex: 0,
                pick: { entryId: 'unit' },
                sheet: loadoutSheet(sheet, weapons, combatCarriers(selection(maces, 4 - maces), book())),
                models: 4,
                rules: [],
                carriers: combatCarriers(selection(maces, 4 - maces), book()),
              },
            ],
          })),
        },
        scoring,
      ).result.meanDamage,
    ).toBeCloseTo(4 * (5 / 6) * (4 / 6) * (4 / 6) * 2)
  })
})
