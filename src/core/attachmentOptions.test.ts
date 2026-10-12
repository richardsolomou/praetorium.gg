import { describe, expect, it } from 'vitest'
import { newHosts, newJoiners, rosterJoiners, type AttachableUnit } from './attachmentOptions'

const host: AttachableUnit = { name: 'Bodyguard', attachment: null }
const leader = { id: 'leader', name: 'Captain', attachment: { kind: 'leader' as const, targets: ['Bodyguard'] } }
const bodyguard = { id: 'host', ...host }

describe('new units that could join a roster unit', () => {
  it('finds a compatible leader by its attachment rules', () => {
    expect(newJoiners([leader], [{ key: 7 }], [host], 0)).toEqual([{ ...leader, reason: null }])
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

  it('explains support that needs a leader the unit lacks', () => {
    const support = { ...leader, attachment: { kind: 'support' as const, targets: ['Bodyguard'], requiresLeader: true as const } }
    expect(newJoiners([support], [{ key: 7 }], [host], 0)[0]?.reason).toBe('Requires an attached Leader.')
  })

  it('explains a full leader slot', () => {
    expect(newJoiners([leader], [{ key: 7 }, { key: 8, attachedTo: 7 }], [host, leader], 0)[0]?.reason).toBe(
      'Leader limit reached on Bodyguard.',
    )
  })

  it('honours a bodyguard that permits more than one leader', () => {
    const roomy = { ...host, attachmentLimits: { leader: 2, support: 1, categories: {} } }
    expect(newJoiners([leader], [{ key: 7 }, { key: 8, attachedTo: 7 }], [roomy, leader], 0)[0]?.reason).toBeNull()
  })

  it('explains a narrower shared attachment category', () => {
    const candidate = { ...leader, attachmentCategories: ['command'] }
    const limited = { ...host, attachmentLimits: { leader: 2, support: 1, categories: { command: { name: 'Command Squad', maximum: 1 } } } }
    expect(newJoiners([candidate], [{ key: 7 }, { key: 8, attachedTo: 7 }], [limited, candidate], 0)[0]?.reason).toBe(
      'Command Squad limit reached on Bodyguard.',
    )
  })

  it('returns nothing for a position the roster no longer holds', () => {
    expect(newJoiners([leader], [], [], 0)).toEqual([])
  })
})

describe('new units a roster character could join', () => {
  it('finds bodyguards through the character’s current enhanced targets', () => {
    const enhanced = { ...leader, attachment: { kind: 'leader' as const, targets: [' bodyguard '] } }
    expect(newHosts([bodyguard], [{ key: 7 }], [enhanced], 0)).toEqual([{ ...bodyguard, reason: null }])
  })

  it('excludes a datasheet the character does not name', () => {
    expect(newHosts([{ ...bodyguard, name: 'Other' }], [{ key: 7 }], [leader], 0)).toEqual([])
  })

  it('offers nothing to a character already attached', () => {
    expect(newHosts([bodyguard], [{ key: 7, attachedTo: 8 }, { key: 8 }], [leader, host], 0)).toEqual([])
  })

  it('explains support that needs a leader a new unit would lack', () => {
    const support = { ...leader, attachment: { kind: 'support' as const, targets: ['Bodyguard'], requiresLeader: true as const } }
    expect(newHosts([bodyguard], [{ key: 7 }], [support], 0)[0]?.reason).toBe('Requires an attached Leader.')
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
