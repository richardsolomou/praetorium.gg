import { describe, expect, it } from 'vitest'
import type { LeagueStage } from '../../../core/league'
import { leagueNextStep } from './leagueEvent'

const STAGES: LeagueStage[] = [
  'empty',
  'approving',
  'recruiting',
  'sizing',
  'pairing',
  'sealing',
  'choosing',
  'ready',
  'playing',
  'results',
]
const organizer = { organizer: true, canPlay: false }
const player = { organizer: false, canPlay: true }

describe('leagueNextStep', () => {
  it.each(STAGES)('gives the organizer a step when the event is %s', (stage) => {
    expect(leagueNextStep(stage, organizer, '1v1')).toBeTruthy()
  })

  it('gives each stage the organizer its own step', () => {
    expect(new Set(STAGES.map((stage) => leagueNextStep(stage, organizer, '1v1'))).size).toBe(STAGES.length)
  })

  it('asks the organizer to answer waiting requests', () => {
    expect(leagueNextStep('approving', organizer, '1v1')).toMatch(/^Answer the requests/)
  })

  it('asks a 2v1 organizer to size players rather than wait for seals', () => {
    expect(leagueNextStep('sizing', organizer, '2v1')).toMatch(/^Size players below/)
  })

  it('asks the organizer for more players when only headcount holds the reveal', () => {
    expect(leagueNextStep('recruiting', organizer, '2v2')).toMatch(/^Share the invite link/)
  })

  it('asks a 2v1 organizer to pair the allies', () => {
    expect(leagueNextStep('pairing', organizer, '2v1')).toBe('Pair the allies below.')
  })

  it('asks a doubles organizer to pair teams', () => {
    expect(leagueNextStep('pairing', organizer, '2v2')).toBe('Pair players into teams below.')
  })

  it.each(STAGES.slice(0, -2))('leaves a player to the status card when the event is %s', (stage) => {
    expect(leagueNextStep(stage, player, '1v1')).toBeNull()
  })

  it('names the battle a 2v1 player starts', () => {
    expect(leagueNextStep('playing', player, '2v1')).toMatch(/^Start a 2 vs 1 battle/)
  })

  it('asks nothing of a player who cannot start a battle yet', () => {
    expect(leagueNextStep('playing', { organizer: false, canPlay: false }, '1v1')).toBeNull()
  })
})
