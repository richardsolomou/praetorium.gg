import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { criteriaKey, loadMissionCriteria, pairCriteria } from './missionCriteria'

const criterion = (vp: number, en: string) => ({ victoryPoints: vp, scoringCriteria: { en } })
const card = (name: string, ...scoring: ReturnType<typeof criterion>[]) => ({
  name: { en: name },
  objectives: [{ scoring }],
})

let directory: string

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-missions-'))
  fs.mkdirSync(path.join(directory, 'missions'))
})

afterEach(() => fs.rmSync(directory, { recursive: true, force: true }))

const writePack = (fileName: string, pack: unknown) =>
  fs.writeFileSync(path.join(directory, 'missions', fileName), JSON.stringify(pack), 'utf8')

describe('reading what a mission pack asks for', () => {
  it('reads a payout out of the pack it is printed in', () => {
    writePack('pack.json', { secondaryMissions: [card('Outflank', criterion(3, 'You are near an edge.'))] })
    expect(loadMissionCriteria(directory).get('outflank')).toEqual([{ vp: 3, criteria: 'You are near an edge.' }])
  })

  it('reads primaries and secondaries alike', () => {
    writePack('pack.json', {
      primaryMissions: [card('Death Trap', criterion(2, 'You trapped a terrain area.'))],
      secondaryMissions: [card('Outflank', criterion(3, 'You are near an edge.'))],
    })
    expect([...loadMissionCriteria(directory).keys()].toSorted()).toEqual(['death trap', 'outflank'])
  })

  it('keeps a card whose payouts span several objectives in printed order', () => {
    writePack('pack.json', {
      secondaryMissions: [
        {
          name: { en: 'Display of Might' },
          objectives: [{ scoring: [criterion(2, 'You outnumber them.')] }, { scoring: [criterion(5, 'You outnumber them.')] }],
        },
      ],
    })
    expect(
      loadMissionCriteria(directory)
        .get('display of might')
        ?.map((payout) => payout.vp),
    ).toEqual([2, 5])
  })

  it('drops a name two packs disagree about rather than picking one', () => {
    writePack('a.json', { secondaryMissions: [card('Outflank', criterion(3, 'One sentence.'))] })
    writePack('b.json', { secondaryMissions: [card('Outflank', criterion(4, 'Another.'))] })
    expect(loadMissionCriteria(directory).has('outflank')).toBe(false)
  })

  it('reads nothing at all when the pack directory is missing', () => {
    expect(loadMissionCriteria(path.join(directory, 'nowhere')).size).toBe(0)
  })

  it('matches a card whatever case and spacing its name was printed in', () => {
    expect(criteriaKey('  Engage  On All Fronts ')).toBe('engage on all fronts')
  })
})

describe('pairing a payout with what it asks for', () => {
  const payouts = [
    { vp: 2, criteria: 'Two.' },
    { vp: 5, criteria: 'Five.' },
  ]

  it('pairs by position when both sources list the payouts the same way', () => {
    expect(pairCriteria([{ vp: 2 }, { vp: 5 }], payouts)).toEqual(['Two.', 'Five.'])
  })

  it('pairs by value when the two sources ordered the payouts differently', () => {
    expect(pairCriteria([{ vp: 5 }, { vp: 2 }], payouts)).toEqual(['Five.', 'Two.'])
  })

  it('pairs nothing when the two sources do not even agree on how many payouts there are', () => {
    expect(pairCriteria([{ vp: 2 }], payouts)).toEqual([null])
  })

  it('pairs nothing when a repeated payout makes the order the only clue and the order disagrees', () => {
    const repeated = [
      { vp: 4, criteria: 'First four.' },
      { vp: 4, criteria: 'Second four.' },
      { vp: 5, criteria: 'Five.' },
    ]
    expect(pairCriteria([{ vp: 5 }, { vp: 4 }, { vp: 4 }], repeated)).toEqual([null, null, null])
  })

  it('still pairs a repeated payout by position when the sequences already agree', () => {
    const repeated = [
      { vp: 4, criteria: 'First four.' },
      { vp: 4, criteria: 'Second four.' },
    ]
    expect(pairCriteria([{ vp: 4 }, { vp: 4 }], repeated)).toEqual(['First four.', 'Second four.'])
  })

  it('pairs nothing when the pack knows nothing about the card', () => {
    expect(pairCriteria([{ vp: 2 }], [])).toEqual([null])
  })
})
