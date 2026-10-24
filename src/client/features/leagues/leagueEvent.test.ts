import { describe, expect, it } from 'vitest'
import type { LeagueStage } from '../../../core/league'
import { leagueNextStep } from './leagueEvent'

const STAGES: LeagueStage[] = ['empty', 'approving', 'sizing', 'pairing', 'sealing', 'choosing', 'ready', 'playing', 'results']
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
    expect(leagueNextStep('sizing', organizer, '2v1')).toMatch(/^Give each player a solo or allied size/)
  })

  it('asks a 2v1 organizer to pair the allies', () => {
    expect(leagueNextStep('pairing', organizer, '2v1')).toBe('Pair the allies below.')
  })

  it('asks a doubles organizer to pair teams', () => {
    expect(leagueNextStep('pairing', organizer, '2v2')).toBe('Pair players into teams below.')
  })

  it('has nothing for a player before anyone is in', () => {
    expect(leagueNextStep('empty', player, '1v1')).toBeNull()
  })

  it('tells a sealing player someone reveals the rosters', () => {
    expect(leagueNextStep('sealing', player, '1v1')).toContain('someone reveals them')
  })

  it('names the battle a 2v1 player starts', () => {
    expect(leagueNextStep('playing', player, '2v1')).toMatch(/^Start a 2 vs 1 battle/)
  })

  it('asks nothing of a player who cannot start a battle yet', () => {
    expect(leagueNextStep('playing', { organizer: false, canPlay: false }, '1v1')).toBeNull()
  })
})
