import { describe, expect, it } from 'vitest'
import type { Attachment } from '../../../core/attach'
import type { KeyedPick } from '../../rosterPicks'
import { attachmentRows, joinableUnits } from './attachments'

const leader = (targets: string[]): Attachment => ({ kind: 'leader', targets })
const support = (targets: string[]): Attachment => ({ kind: 'support', targets })

const pick = (key: number, entryId: string, attachedTo?: number): KeyedPick => ({ key, entryId, attachedTo })
const unit = (name: string, attachment: Attachment | null = null) => ({ name, attachment })

describe('joinableUnits', () => {
  it('offers only the units a leader names', () => {
    const picks = [pick(0, 'captain'), pick(1, 'intercessors'), pick(2, 'terminators')]
    const units = [unit('Captain', leader(['Intercessor Squad'])), unit('Intercessor Squad'), unit('Terminator Squad')]

    expect(joinableUnits(picks, units, 0)).toEqual([{ key: 1, name: 'Intercessor Squad' }])
  })

  it('matches the named target however it is cased or spaced', () => {
    const picks = [pick(0, 'captain'), pick(1, 'intercessors')]
    const units = [unit('Captain', leader([' intercessor squad '])), unit('Intercessor Squad')]

    expect(joinableUnits(picks, units, 0)).toEqual([{ key: 1, name: 'Intercessor Squad' }])
  })

  it('offers nothing to a unit that has already joined one', () => {
    const picks = [pick(0, 'captain', 1), pick(1, 'intercessors')]
    const units = [unit('Captain', leader(['Intercessor Squad'])), unit('Intercessor Squad')]

    expect(joinableUnits(picks, units, 0)).toEqual([])
  })

  it('keeps a second leader away from a unit that is already led', () => {
    const picks = [pick(0, 'captain', 2), pick(1, 'lieutenant'), pick(2, 'intercessors')]
    const units = [
      unit('Captain', leader(['Intercessor Squad'])),
      unit('Lieutenant', leader(['Intercessor Squad'])),
      unit('Intercessor Squad'),
    ]

    expect(joinableUnits(picks, units, 1)).toEqual([])
  })

  it('still offers support to a unit that is already led', () => {
    const picks = [pick(0, 'captain', 2), pick(1, 'servitors'), pick(2, 'intercessors')]
    const units = [
      unit('Captain', leader(['Intercessor Squad'])),
      unit('Servitors', support(['Intercessor Squad'])),
      unit('Intercessor Squad'),
    ]

    expect(joinableUnits(picks, units, 1)).toEqual([{ key: 2, name: 'Intercessor Squad' }])
  })

  it('keeps a second support away from a unit that is already supported', () => {
    const picks = [pick(0, 'servitors', 2), pick(1, 'apothecary'), pick(2, 'intercessors')]
    const units = [
      unit('Servitors', support(['Intercessor Squad'])),
      unit('Apothecary', support(['Intercessor Squad'])),
      unit('Intercessor Squad'),
    ]

    expect(joinableUnits(picks, units, 1)).toEqual([])
  })

  it('offers nothing for a unit that cannot attach at all', () => {
    const picks = [pick(0, 'intercessors'), pick(1, 'terminators')]
    expect(joinableUnits(picks, [unit('Intercessor Squad'), unit('Terminator Squad')], 0)).toEqual([])
  })

  it('offers nothing while the price has not caught up with the picks', () => {
    expect(joinableUnits([pick(0, 'captain')], [], 0)).toEqual([])
  })
})

describe('attachmentRows', () => {
  it('states both sides of one attachment', () => {
    const picks = [pick(0, 'captain', 1), pick(1, 'intercessors')]
    const units = [unit('Captain', leader(['Intercessor Squad'])), unit('Intercessor Squad')]

    expect(attachmentRows(picks, units, 0)).toEqual([{ label: 'Leading', name: 'Intercessor Squad', action: 'Remove', detach: 0 }])
    expect(attachmentRows(picks, units, 1)).toEqual([{ label: 'Leader', name: 'Captain', action: 'Detach', detach: 0 }])
  })

  it('names a supporting unit as support on both cards', () => {
    const picks = [pick(0, 'servitors', 1), pick(1, 'techmarine')]
    const units = [unit('Servitors', support(['Techmarine'])), unit('Techmarine')]

    expect(attachmentRows(picks, units, 0)).toEqual([{ label: 'Supporting', name: 'Techmarine', action: 'Remove', detach: 0 }])
    expect(attachmentRows(picks, units, 1)).toEqual([{ label: 'Support', name: 'Servitors', action: 'Detach', detach: 0 }])
  })

  it('lists every unit standing with the host', () => {
    const picks = [pick(0, 'captain', 2), pick(1, 'servitors', 2), pick(2, 'intercessors')]
    const units = [
      unit('Captain', leader(['Intercessor Squad'])),
      unit('Servitors', support(['Intercessor Squad'])),
      unit('Intercessor Squad'),
    ]

    expect(attachmentRows(picks, units, 2)).toEqual([
      { label: 'Leader', name: 'Captain', action: 'Detach', detach: 0 },
      { label: 'Support', name: 'Servitors', action: 'Detach', detach: 1 },
    ])
  })

  it('says nothing about a pick attached to a unit the price has not returned', () => {
    expect(attachmentRows([pick(0, 'captain', 9)], [unit('Captain', leader([]))], 0)).toEqual([])
  })
})
