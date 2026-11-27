import { describe, expect, it } from 'vitest'
import { VS_ALLEGIANCE, VS_ENHANCEMENT, VS_MODELS, vsModelKinds, vsUnitChoices, vsUnitToggles, vsWithSpread } from './unitChoices'
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

  it('offers the Warlord to the CHARACTER model of a unit that is not one', () => {
    const command = vsFirstFielding(definitions, 'host.command')
    expect(vsUnitToggles(definitions, command, { roster: { faction: 'host', detachments: [] } })[0]?.key).toBe('host.command.commander')
  })

  it('requires the Warlord a faction without Detachments names', () => {
    const walker = vsFirstFielding(definitions, 'titans.walker')
    expect(vsUnitToggles(definitions, walker, { roster: { faction: 'titans', detachments: [] } })[0]?.required).toBe(true)
  })

  it('offers no Warlord to a CHARACTER whose models VS Data keeps from the role', () => {
    const veterans = vsFirstFielding(definitions, 'host.veterans')
    expect(vsUnitToggles(definitions, veterans, { roster: { faction: 'host', detachments: [] } })).toEqual([])
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

describe('vsWithSpread', () => {
  const brood = vsFirstFielding(definitions, 'host.brood')
  const option = 'host.brood.fleshborer'

  it('takes a uniform option’s main choice on every carrier', () => {
    expect(vsWithSpread(definitions, brood, option, {}, { 'host.devourer': 10, 'host.spike': 0 }).options).toEqual({
      [option]: { 'host.devourer': 10 },
    })
  })

  it('hands a substitute put down back to the main choice', () => {
    const current = { 'host.devourer': 9, 'host.spike': 1 }
    const held = vsWithSpread(definitions, brood, option, {}, current)
    expect(vsWithSpread(definitions, held, option, current, { 'host.spike': 0 }).options).toEqual({ [option]: { 'host.devourer': 10 } })
  })

  it('keeps the substitutes when the main choice is taken whole', () => {
    const spiked = vsWithSpread(definitions, brood, option, {}, { 'host.spike': 1 })
    const current = { 'host.devourer': 0, 'host.spike': 1 }
    expect(vsWithSpread(definitions, spiked, option, current, { 'host.devourer': 10, 'host.spike': 0 }).options).toEqual({
      [option]: { 'host.devourer': 9, 'host.spike': 1 },
    })
  })
})

describe('uniform options tied together', () => {
  it('take the same choice on every carrier', () => {
    const veterans = vsFirstFielding(definitions, 'host.veterans')
    expect(vsWithSpread(definitions, veterans, 'host.veterans.veteran-pistol', {}, { 'host.sword': 2 }).options).toEqual({
      'host.veterans.veteran-pistol': { 'host.sword': 2 },
      'host.veterans.sergeant-pistol': { 'host.sword': 1 },
    })
  })
})
