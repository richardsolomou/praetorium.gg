import { describe, expect, it } from 'vitest'
import type { LeagueStage } from '../../../core/league'
import { leagueNextStep } from './leagueEvent'

const STAGES: LeagueStage[] = ['empty', 'joining', 'sealing', 'ready', 'playing', 'results']

describe('leagueNextStep', () => {
  it.each(STAGES)('gives the organizer a step when the event is %s', (stage) => {
    expect(leagueNextStep(stage, true, '1v1')).toBeTruthy()
  })

  it('gives each stage the organizer its own step', () => {
    expect(new Set(STAGES.map((stage) => leagueNextStep(stage, true, '1v1'))).size).toBe(STAGES.length)
  })

  it('gives each stage a player is in its own step', () => {
    expect(new Set(STAGES.slice(1).map((stage) => leagueNextStep(stage, false, '1v1'))).size).toBe(STAGES.length - 1)
  })

  it('has nothing for a player before anyone is in', () => {
    expect(leagueNextStep('empty', false, '1v1')).toBeNull()
  })

  it('asks a doubles organizer for four players', () => {
    expect(leagueNextStep('joining', true, '2v2')).toContain('at least 4 players')
  })

  it('points the organizer at the reveal once every roster is in', () => {
    expect(leagueNextStep('ready', true, '1v1')).toMatch(/^Reveal the rosters/)
  })
})
