import { describe, expect, it } from 'vitest'
import { VS_ALLEGIANCE, VS_ENHANCEMENT, VS_MODELS, vsModelKinds, vsUnitChoices, vsUnitToggles } from './unitChoices'
import { definitions } from './vsUnit.fixtures'
import { vsFirstFielding, vsUnitDefinitions, vsUnitOptions, vsUnitRecords, vsWithChoice } from './vsDataUnit'

const squad = vsFirstFielding(definitions, 'host.squad')
const choiceOf = (unit: typeof squad, key: string, roster?: { faction: string; detachments: string[] }) =>
  vsUnitChoices(definitions, unit, roster ? { roster } : {}).find((choice) => choice.key === key)

describe('vsUnitChoices', () => {
  it('lets a full option swap to its other choice', () => {
    const armed = vsWithChoice(definitions, squad, 'host.squad.sergeant-rifle', { 'host.sword': 1 })
    expect(choiceOf(armed, 'host.squad.sergeant-rifle')?.options.find((option) => option.id === 'host.pistol')?.max).toBe(1)
  })

  it('holds a choice to its cap while the option has room', () => {
    expect(choiceOf(squad, 'host.squad.trooper-rifle')?.options[0]?.max).toBe(1)
  })

  it('divides a unit between models it counts freely', () => {
    expect(choiceOf(vsFirstFielding(definitions, 'host.band'), VS_MODELS)?.room).toBe(4)
  })

  it('counts no models where only one kind is free', () => {
    expect(choiceOf(squad, VS_MODELS)).toBeUndefined()
  })

  it('offers an Enhancement only from the roster’s Detachments', () => {
    expect(choiceOf(squad, VS_ENHANCEMENT, { faction: 'host', detachments: ['host.rearguard'] })).toBeUndefined()
  })

  it('offers an Enhancement to a unit it admits', () => {
    const captain = vsFirstFielding(definitions, 'host.captain')
    expect(choiceOf(captain, VS_ENHANCEMENT, { faction: 'host', detachments: ['host.vanguard'] })?.options[0]?.id).toBe(
      'host.vanguard.banner',
    )
  })

  it('requires an allegiance its Detachment requires', () => {
    expect(choiceOf(squad, VS_ALLEGIANCE, { faction: 'host', detachments: ['host.vanguard'] })?.optional).toBe(false)
  })
})

describe('vsUnitToggles', () => {
  it('offers the Warlord to a CHARACTER of the roster’s book', () => {
    const captain = vsFirstFielding(definitions, 'host.captain')
    expect(vsUnitToggles(definitions, captain, { roster: { faction: 'host', detachments: [] } })).toHaveLength(1)
  })

  it('offers no Warlord to a unit without CHARACTER', () => {
    expect(vsUnitToggles(definitions, squad, { roster: { faction: 'host', detachments: [] } })).toEqual([])
  })
})

describe('vsModelKinds', () => {
  it('takes what an option replaces off the model’s own wargear', () => {
    const armed = vsWithChoice(definitions, squad, 'host.squad.trooper-rifle', { 'host.cannon': 1 })
    const trooper = vsModelKinds(definitions, armed).find((kind) => kind.name === 'Trooper')
    expect(trooper?.fixed).toEqual([{ name: 'Rifle', count: 3 }])
  })
})

describe('vsUnitRecords', () => {
  it('reads a unit’s options alone as the whole release does', () => {
    const alone = vsUnitDefinitions(vsUnitRecords(definitions, 'host.squad')!)
    expect(vsUnitOptions(alone, squad)).toEqual(vsUnitOptions(definitions, squad))
  })
})
