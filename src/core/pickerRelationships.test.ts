import { describe, expect, it } from 'vitest'
import { pickerRelationships } from './pickerRelationships'
import type { AttachableUnit } from './attachmentOptions'

const host: AttachableUnit = { name: 'Bodyguard', attachment: null }
const leader = { id: 'leader', name: 'Captain', attachment: { kind: 'leader' as const, targets: ['Bodyguard'] } }
const picks = [{ key: 7 }]
const relation = { kind: 'leaders' as const, key: 7 }

describe('picker relationships', () => {
  it('finds a compatible leader independently of its name and search fields', () => {
    expect(pickerRelationships([leader], picks, [host], relation)).toEqual([
      { ...leader, relationship: 'Compatible leader for Bodyguard', attachmentReason: null },
    ])
  })

  it('does not mistake a keyword or a name for a relationship', () => {
    expect(pickerRelationships([{ ...leader, name: 'Bodyguard Captain', attachment: null }], picks, [host], relation)).toEqual([])
  })

  it('excludes a leader that names a different bodyguard', () => {
    expect(pickerRelationships([{ ...leader, attachment: { kind: 'leader', targets: ['Other'] } }], picks, [host], relation)).toEqual([])
  })

  it('excludes support from leader discovery', () => {
    expect(pickerRelationships([{ ...leader, attachment: { kind: 'support', targets: ['Bodyguard'] } }], picks, [host], relation)).toEqual(
      [],
    )
  })

  it('keeps an allied compatible leader offered by the book', () => {
    expect(pickerRelationships([{ ...leader, allied: true }], picks, [host], relation).map((unit) => unit.id)).toEqual(['leader'])
  })

  it('keeps a full attachment relationship and explains the unavailable slot', () => {
    expect(pickerRelationships([leader], [...picks, { key: 8, attachedTo: 7 }], [host, leader], relation)[0]?.attachmentReason).toBe(
      'Leader limit reached on Bodyguard.',
    )
  })

  it('honours a bodyguard that permits more than one leader', () => {
    expect(
      pickerRelationships(
        [leader],
        [...picks, { key: 8, attachedTo: 7 }],
        [{ ...host, attachmentLimits: { leader: 2, support: 1, categories: {} } }, leader],
        relation,
      )[0]?.attachmentReason,
    ).toBeNull()
  })

  it('explains a narrower shared attachment category', () => {
    const candidate = { ...leader, attachmentCategories: ['command'] }
    const limited = { ...host, attachmentLimits: { leader: 2, support: 1, categories: { command: { name: 'Command Squad', maximum: 1 } } } }
    expect(
      pickerRelationships([candidate], [...picks, { key: 8, attachedTo: 7 }], [limited, candidate], relation)[0]?.attachmentReason,
    ).toBe('Command Squad limit reached on Bodyguard.')
  })

  it('finds bodyguards through the selected leader’s current enhanced targets', () => {
    expect(
      pickerRelationships([{ id: 'host', ...host }], picks, [{ ...leader, attachment: { kind: 'leader', targets: [' bodyguard '] } }], {
        kind: 'bodyguards',
        key: 7,
      })[0]?.relationship,
    ).toBe('Compatible bodyguard for Captain')
  })

  it('explains why an already attached leader cannot choose another bodyguard', () => {
    expect(
      pickerRelationships([{ id: 'host', ...host }], [{ key: 7, attachedTo: 8 }], [leader], { kind: 'bodyguards', key: 7 })[0]
        ?.attachmentReason,
    ).toBe('Already attached; detach before choosing another bodyguard.')
  })

  it('returns no relationships when a rules version removes eligibility', () => {
    expect(pickerRelationships([{ ...leader, attachment: null }], picks, [host], relation)).toEqual([])
  })

  it('returns no relationships after the selected roster unit is removed', () => {
    expect(pickerRelationships([leader], [], [], relation)).toEqual([])
  })
})
