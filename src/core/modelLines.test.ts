import { describe, expect, it } from 'vitest'
import { modelLineDrafts, unitHeldWargearIn } from './modelLines'
import { wargearKey } from './wargearNames'
import { lineSurvivors } from './combatSurvivors'

const lines = (drafts: ReturnType<typeof modelLineDrafts>) => drafts.map((draft) => `${draft.name}×${draft.models}`)

describe('model lines', () => {
  it('are one line for models nobody can tell apart', () => {
    const carriers = [
      { name: 'Kroot Farstalker', models: 8, weapons: [{ name: 'Farstalker firearm', count: 8 }] },
      { name: 'Kroot Farstalker', models: 1, weapons: [{ name: 'Farstalker firearm', count: 1 }] },
      { name: 'Kroot Kill-broker', models: 1, weapons: [{ name: 'Ritual blade', count: 1 }] },
    ]
    expect(lines(modelLineDrafts(carriers, []))).toEqual(['Kroot Farstalker×9', 'Kroot Kill-broker×1'])
  })

  it('split off the bearer of a single upgrade the weapons leave out', () => {
    const carriers = [{ name: 'Possessed', models: 5, weapons: [{ name: 'Hideous mutations', count: 5 }] }]
    const wargear = [
      { name: 'Hideous mutations', count: 5 },
      { name: 'Chaos icon', count: 1 },
    ]
    expect(lines(modelLineDrafts(carriers, wargear))).toEqual(['Chaos icon×1', 'Possessed×4'])
  })

  it('leave two upgrades unsplit, since one model might carry both', () => {
    const carriers = [{ name: 'Pink Horror', models: 10, weapons: [{ name: 'Pink claws', count: 10 }] }]
    const wargear = [
      { name: 'Daemonic Icon', count: 1 },
      { name: 'Instrument of Chaos', count: 1 },
    ]
    expect(lines(modelLineDrafts(carriers, wargear))).toEqual(['Pink Horror×10'])
  })

  it('name lines the data names alike by the wargear only they carry', () => {
    const carriers = [
      {
        name: 'Tomb Crawler w/ twin gauss reaper',
        models: 1,
        weapons: [
          { name: 'Twin gauss reaper', count: 1 },
          { name: 'Claws', count: 1 },
        ],
      },
      {
        name: 'Tomb Crawler w/ twin gauss reaper',
        models: 1,
        weapons: [
          { name: 'Claws', count: 1 },
          { name: 'Transdimensional isolator', count: 1 },
        ],
      },
    ]
    expect(lines(modelLineDrafts(carriers, []))).toEqual(['Twin gauss reaper×1', 'Transdimensional isolator×1'])
  })

  it('name a specialist by the piece the data marks it with', () => {
    const carriers = [
      { name: 'Shock Trooper', models: 7, weapons: [{ name: 'Lasgun', count: 7 }] },
      { name: 'Shock Trooper w/ Vox Caster', models: 1, weapons: [{ name: 'Lasgun', count: 1 }] },
      { name: 'Shock Trooper Sergeant', models: 1, weapons: [{ name: 'Laspistol', count: 1 }] },
    ]
    const wargear = [
      { name: 'Lasgun', count: 8 },
      { name: 'Vox-caster', count: 1 },
      { name: 'Laspistol', count: 1 },
    ]
    expect(lines(modelLineDrafts(carriers, wargear))).toEqual(['Shock Trooper×7', 'Vox-caster×1', 'Shock Trooper Sergeant×1'])
  })

  it('list the piece a specialist is named by among its wargear', () => {
    const carriers = [
      { name: 'Shock Trooper', models: 7, weapons: [{ name: 'Lasgun', count: 7 }] },
      { name: 'Shock Trooper w/ Vox Caster', models: 1, weapons: [{ name: 'Lasgun', count: 1 }] },
    ]
    const vox = modelLineDrafts(carriers, [{ name: 'Vox-caster', count: 1 }])[1]
    expect(vox?.wargear.map((piece) => piece.name)).toEqual(['Lasgun', 'Vox-caster'])
  })

  it('name a specialist by the full name of the piece its mark shortens', () => {
    const carriers = [
      { name: 'Skitarii Ranger', models: 8, weapons: [{ name: 'Galvanic rifle', count: 8 }] },
      { name: 'Skitarii Ranger w/ data-tether', models: 1, weapons: [{ name: 'Galvanic rifle', count: 1 }] },
    ]
    const tether = modelLineDrafts(carriers, [{ name: 'Enhanced data-tether', count: 1 }])[1]
    expect(tether?.name).toBe('Enhanced data-tether')
  })

  it('keep wargear the unit holds with every model, splitting off no bearer', () => {
    const carriers = [{ name: 'Ophydian Destroyer', models: 3, weapons: [{ name: 'Ophydian hyperphase weapons', count: 3 }] }]
    const wargear = [
      { name: 'Ophydian hyperphase weapons', count: 3 },
      { name: 'Plasmacyte', count: 1 },
    ]
    expect(lines(modelLineDrafts(carriers, wargear, new Set([wargearKey('Plasmacyte')])))).toEqual(['Ophydian Destroyer×3'])
  })

  it('read the wargear a card says the unit has', () =>
    expect(unitHeldWargearIn('For every 3 models in this unit, this unit can have 1 Plasmacyte.')).toEqual(['Plasmacyte']))

  it('read no unit wargear from a piece a model carries', () =>
    expect(unitHeldWargearIn('1 Legionary can be equipped with 1 Chaos icon.')).toEqual([]))

  it('read no unit wargear from the Leader units a Bodyguard can have', () =>
    expect(unitHeldWargearIn('This unit can have up to two Leader units attached to it.')).toEqual([]))

  it('field survivors of a battle saved without a line for unit wargear', () => {
    const carriers = [{ name: 'Ophydian Destroyer', models: 3, weapons: [{ name: 'Ophydian hyperphase weapons', count: 3 }] }]
    const wargear = [
      { name: 'Ophydian hyperphase weapons', count: 3 },
      { name: 'Plasmacyte', count: 1 },
    ]
    expect(
      lineSurvivors(carriers, wargear, [{ name: 'Ophydian Destroyer', models: 3, alive: 2 }])?.map((carrier) => carrier.models),
    ).toEqual([2])
  })

  it('field survivors of a merged line from the carriers it spans', () => {
    const carriers = [
      { name: 'Kroot Farstalker', models: 8, weapons: [{ name: 'Farstalker firearm', count: 8 }] },
      { name: 'Kroot Farstalker', models: 1, weapons: [{ name: 'Farstalker firearm', count: 1 }] },
    ]
    expect(lineSurvivors(carriers, [], [{ name: 'Kroot Farstalker', models: 9, alive: 8 }])?.map((carrier) => carrier.models)).toEqual([
      8, 0,
    ])
  })
})
