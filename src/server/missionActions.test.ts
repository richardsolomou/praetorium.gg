import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadMissionActions } from './missionActions'

const action = (name: string, fields: Record<string, unknown> = {}) => ({
  name: { en: name },
  startsText: { en: 'Your Shooting phase.' },
  completesText: { en: 'End of your turn, if your unit controls that **objective**.' },
  effectText: { en: 'Your unit **secures the asset**.' },
  unitsText: { en: 'One friendly unit within range of one **objective**.' },
  useLimitText: { en: 'Once per turn.' },
  ...fields,
})

let directory: string

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-actions-'))
  fs.mkdirSync(path.join(directory, 'missions'))
})

afterEach(() => fs.rmSync(directory, { recursive: true, force: true }))

const writePack = (fileName: string, pack: unknown) =>
  fs.writeFileSync(path.join(directory, 'missions', fileName), JSON.stringify(pack), 'utf8')

describe('reading the action a mission card names', () => {
  it('reads it out of the pack the card is printed in', () => {
    writePack('pack.json', { primaryMissions: [{ name: { en: 'Secure Asset' }, actions: [action('SECURE ASSET')] }] })
    expect(loadMissionActions(directory).get('secure asset')).toEqual([
      {
        name: 'SECURE ASSET',
        starts: 'Your Shooting phase.',
        completes: 'End of your turn, if your unit controls that **objective**.',
        effect: 'Your unit **secures the asset**.',
        units: 'One friendly unit within range of one **objective**.',
        useLimit: 'Once per turn.',
        restriction: null,
      },
    ])
  })

  it('keeps a restriction the pack states', () => {
    const restrictionText = { en: 'A unit cannot start this action alone.' }
    writePack('pack.json', { primaryMissions: [{ name: { en: 'Extract Relic' }, actions: [action('SENSOR SWEEP', { restrictionText })] }] })
    expect(loadMissionActions(directory).get('extract relic')?.[0]?.restriction).toBe('A unit cannot start this action alone.')
  })

  it('reads primaries and secondaries alike', () => {
    writePack('pack.json', {
      primaryMissions: [{ name: { en: 'Death Trap' }, actions: [action('BOOBY TRAP')] }],
      secondaryMissions: [{ name: { en: 'Cleanse' }, actions: [action('CLEANSE')] }],
    })
    expect([...loadMissionActions(directory).keys()].toSorted()).toEqual(['cleanse', 'death trap'])
  })

  it('keeps every action a card prints, in printed order', () => {
    writePack('pack.json', { primaryMissions: [{ name: { en: 'Vital Link' }, actions: [action('MAINTAIN CONTROL'), action('SABOTAGE')] }] })
    expect(
      loadMissionActions(directory)
        .get('vital link')
        ?.map((entry) => entry.name),
    ).toEqual(['MAINTAIN CONTROL', 'SABOTAGE'])
  })

  it('leaves a card that prints no action out entirely', () => {
    writePack('pack.json', { primaryMissions: [{ name: { en: 'Take and Hold' }, actions: [] }] })
    expect(loadMissionActions(directory).has('take and hold')).toBe(false)
  })

  it('drops an unnamed action rather than showing a nameless one', () => {
    writePack('pack.json', {
      primaryMissions: [{ name: { en: 'Sabotage' }, actions: [{ effectText: { en: 'Your unit sabotages it.' } }] }],
    })
    expect(loadMissionActions(directory).has('sabotage')).toBe(false)
  })

  it('drops a name two packs disagree about rather than picking one', () => {
    writePack('a.json', { primaryMissions: [{ name: { en: 'Sabotage' }, actions: [action('SABOTAGE')] }] })
    writePack('b.json', { primaryMissions: [{ name: { en: 'Sabotage' }, actions: [action('DEMOLITION')] }] })
    expect(loadMissionActions(directory).has('sabotage')).toBe(false)
  })

  it('reads no pack at all where there is no mission directory', () => {
    expect(loadMissionActions(path.join(directory, 'absent')).size).toBe(0)
  })
})
