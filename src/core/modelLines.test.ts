import { describe, expect, it } from 'vitest'
import { modelLineDrafts } from './modelLines'
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
