import { describe, expect, it } from 'vitest'
import { availableChoices, newHosts, newJoiners, rosterJoiners, type AttachableUnit } from './attachmentOptions'

const host: AttachableUnit = { name: 'Bodyguard', attachment: null }
const leader = { id: 'leader', name: 'Captain', attachment: { kind: 'leader' as const, targets: ['Bodyguard'] } }
const bodyguard = { id: 'host', ...host }

describe('new units that could join a roster unit', () => {
  it('finds a compatible leader by its attachment rules', () => {
    expect(newJoiners([leader], [{ key: 7 }], [host], 0)).toEqual([leader])
  })

  it('does not mistake a name for a relationship', () => {
    expect(newJoiners([{ ...leader, name: 'Bodyguard Captain', attachment: null }], [{ key: 7 }], [host], 0)).toEqual([])
  })

  it('excludes a leader that names a different bodyguard', () => {
    expect(newJoiners([{ ...leader, attachment: { kind: 'leader', targets: ['Other'] } }], [{ key: 7 }], [host], 0)).toEqual([])
  })

  it('offers compatible support alongside leaders', () => {
    const support = { ...leader, id: 'support', attachment: { kind: 'support' as const, targets: ['Bodyguard'] } }
    expect(newJoiners([support], [{ key: 7 }], [host], 0).map((unit) => unit.id)).toEqual(['support'])
  })

  it('omits support that needs a leader the unit lacks', () => {
    const support = { ...leader, attachment: { kind: 'support' as const, targets: ['Bodyguard'], requiresLeader: true as const } }
    expect(newJoiners([support], [{ key: 7 }], [host], 0)).toEqual([])
  })

  it('offers nothing once the only leader slot is full and the unit takes no support', () => {
    expect(newJoiners([leader], [{ key: 7 }, { key: 8, attachedTo: 7 }], [host, leader], 0)).toEqual([])
  })

  it('offers only support while the leader slot is full and the support slot is free', () => {
    const support = { ...leader, id: 'support', attachment: { kind: 'support' as const, targets: ['Bodyguard'] } }
    expect(newJoiners([leader, support], [{ key: 7 }, { key: 8, attachedTo: 7 }], [host, leader], 0).map((unit) => unit.id)).toEqual([
      'support',
    ])
  })

  it('honours a bodyguard that permits more than one leader', () => {
    const roomy = { ...host, attachmentLimits: { leader: 2, support: 1, categories: {} } }
    expect(newJoiners([leader], [{ key: 7 }, { key: 8, attachedTo: 7 }], [roomy, leader], 0)).toEqual([leader])
  })

  it('omits a leader whose narrower shared attachment category is full', () => {
    const candidate = { ...leader, attachmentCategories: ['command'] }
    const limited = { ...host, attachmentLimits: { leader: 2, support: 1, categories: { command: { name: 'Command Squad', maximum: 1 } } } }
    expect(newJoiners([candidate], [{ key: 7 }, { key: 8, attachedTo: 7 }], [limited, candidate], 0)).toEqual([])
  })

  it('returns nothing for a position the roster no longer holds', () => {
    expect(newJoiners([leader], [], [], 0)).toEqual([])
  })
})

describe('new units a roster character could join', () => {
  it('finds bodyguards through the character’s current enhanced targets', () => {
    const enhanced = { ...leader, attachment: { kind: 'leader' as const, targets: [' bodyguard '] } }
    expect(newHosts([bodyguard], [{ key: 7 }], [enhanced], 0)).toEqual([bodyguard])
  })

  it('excludes a datasheet the character does not name', () => {
    expect(newHosts([{ ...bodyguard, name: 'Other' }], [{ key: 7 }], [leader], 0)).toEqual([])
  })

  it('offers nothing to a character already attached', () => {
    expect(newHosts([bodyguard], [{ key: 7, attachedTo: 8 }, { key: 8 }], [leader, host], 0)).toEqual([])
  })

  it('omits a new bodyguard for support that needs a leader it would lack', () => {
    const support = { ...leader, attachment: { kind: 'support' as const, targets: ['Bodyguard'], requiresLeader: true as const } }
    expect(newHosts([bodyguard], [{ key: 7 }], [support], 0)).toEqual([])
  })

  it('offers nothing to a unit without attachment rules', () => {
    expect(newHosts([bodyguard], [{ key: 7 }], [host], 0)).toEqual([])
  })
})

describe('roster units that could join a roster unit', () => {
  it('offers an unattached leader that names the unit', () => {
    expect(rosterJoiners([{ key: 7 }, { key: 8 }], [host, leader], 0)).toEqual([{ key: 8, name: 'Captain' }])
  })

  it('omits a leader already attached elsewhere', () => {
    expect(rosterJoiners([{ key: 7 }, { key: 8, attachedTo: 9 }, { key: 9 }], [host, leader, host], 0)).toEqual([])
  })

  it('omits leaders once the unit’s leader slot is full', () => {
    expect(rosterJoiners([{ key: 7 }, { key: 8, attachedTo: 7 }, { key: 9 }], [host, leader, leader], 0)).toEqual([])
  })
})

describe('whether an attach menu is offered', () => {
  it('hides a menu whose every choice is unavailable', () => {
    expect(availableChoices([{ reason: 'Limit reached: 1 of 1 permitted copies in the roster.' }])).toEqual([])
  })

  it('keeps unavailable choices beside an available one', () => {
    const choices = [{ reason: null }, { reason: 'Limit reached: 1 of 1 permitted copies in the roster.' }]
    expect(availableChoices(choices)).toBe(choices)
  })

  it('offers a roster unit, which carries no reason', () => {
    expect(availableChoices([{ name: 'Captain' }])).toEqual([{ name: 'Captain' }])
  })
})
