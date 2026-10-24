import { describe, expect, it } from 'vitest'
import { leagueRevealChecklist } from '../../../core/league'
import { LEAGUE_SAMPLE_VIEWER, sampleLeague, sampleLeagueResults } from './sampleLeague'

const lists = (stage: Parameters<typeof sampleLeague>[0]) => {
  const league = sampleLeague(stage)
  return leagueRevealChecklist(league, league.entries).find((check) => check.step === 'lists')
}

describe('sample league', () => {
  it('leaves the reader out until they join', () => {
    expect(sampleLeague('join').entries.some((entry) => entry.userId === LEAGUE_SAMPLE_VIEWER)).toBe(false)
  })

  it('holds the reveal for one unsealed roster once the reader has sealed', () => {
    expect(lists('seal')?.waiting).toEqual(['sample-brutus'])
  })

  it('is ready to reveal at the reveal', () => {
    expect(lists('reveal')?.done).toBe(true)
  })

  it('shows every army only once revealed', () => {
    expect(sampleLeague('seal').entries.some((entry) => entry.army)).toBe(false)
  })

  it('has no results before anyone plays', () => {
    expect(sampleLeagueResults('reveal').rows.some((row) => row.played)).toBe(false)
  })

  it('ranks the last stage by wins, draws, then victory points', () => {
    expect(sampleLeagueResults('play').rows.map((row) => row.userId)).toEqual([
      'sample-cassia',
      'sample-aurelia',
      LEAGUE_SAMPLE_VIEWER,
      'sample-brutus',
    ])
  })

  it('leaves the reader one opponent to play', () => {
    const met = sampleLeagueResults('play').met.filter((pair) => pair.includes(LEAGUE_SAMPLE_VIEWER))
    expect(met).toHaveLength(2)
  })
})
