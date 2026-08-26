import { describe, expect, it } from 'vitest'
import { attachedUnitList, attachedUnits } from './attachedUnits'

const MARINES = { key: 'marines', formationOptions: ['deep-strike'], prebattleRules: ['infiltrators'] }
const LORD = { key: 'lord', attachedTo: 'marines', formationOptions: ['deep-strike'], prebattleRules: [] }
const RHINO = { key: 'rhino', formationOptions: [], prebattleRules: [] }

describe('attachedUnits', () => {
  it('answers a character with the unit it joined', () => {
    expect(attachedUnits([MARINES, LORD], 'lord').map((unit) => unit.key)).toEqual(['marines', 'lord'])
  })

  it('answers a joined unit with the characters attached to it', () => {
    expect(attachedUnits([MARINES, LORD], 'marines').map((unit) => unit.key)).toEqual(['marines', 'lord'])
  })

  it('leaves a character naming a unit the log does not hold standing alone', () => {
    expect(attachedUnits([LORD], 'lord').map((unit) => unit.key)).toEqual(['lord'])
  })

  it('knows nothing about a unit that is not there', () => {
    expect(attachedUnits([MARINES], 'lord')).toEqual([])
  })
})

describe('attachedUnitList', () => {
  it('lists an attached unit once, under the unit that was joined', () => {
    expect(attachedUnitList([MARINES, LORD, RHINO]).map((unit) => unit.host.key)).toEqual(['marines', 'rhino'])
  })

  it('names the characters standing with the unit they joined', () => {
    expect(attachedUnitList([MARINES, LORD])[0]?.joined.map((unit) => unit.key)).toEqual(['lord'])
  })

  it('keeps a deployment ability every part of the unit has', () => {
    expect(attachedUnitList([MARINES, LORD])[0]?.formationOptions).toEqual(['deep-strike'])
  })

  it('drops a deployment ability the character it joined does not have', () => {
    expect(attachedUnitList([MARINES, { ...LORD, formationOptions: [] }])[0]?.formationOptions).toEqual([])
  })

  it('drops a pre-battle rule the character it joined does not have', () => {
    expect(attachedUnitList([MARINES, LORD])[0]?.prebattleRules).toEqual([])
  })

  it('leaves a unit standing alone with the abilities of its own datasheet', () => {
    expect(attachedUnitList([MARINES])[0]?.prebattleRules).toEqual(['infiltrators'])
  })
})
