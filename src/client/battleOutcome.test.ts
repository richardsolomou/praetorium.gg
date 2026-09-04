import { describe, expect, it } from 'vitest'
import { battleOutcome, battleResult } from './battleOutcome'

const player = (id: string, side: number) => ({ id, side })
const side = (index: number, names: string[], total = 0) => ({
  index,
  total,
  armies: names.map((playerName) => ({ playerName })),
})

describe('battle outcome', () => {
  it('uses a singular verb for a player who wins by concession', () => {
    const table = [side(0, ['Rago']), side(1, ['Tronic'])]
    const view = { players: [player('rago', 0), player('tronic', 1)], result: { reason: 'conceded' as const, concededBy: 'tronic' } }

    expect(battleOutcome(table, view)).toBe('Rago wins by concession')
  })

  it('uses a singular verb for a player who wins on points', () => {
    const table = [side(0, ['Rago'], 76), side(1, ['Tronic'], 83)]
    const view = { players: [player('rago', 0), player('tronic', 1)], result: { reason: 'completed' as const, concededBy: null } }

    expect(battleOutcome(table, view)).toBe('Tronic wins 83–76')
  })

  it('names the winning side, and its score apart from the sentence', () => {
    const table = [side(0, ['Rago'], 76), side(1, ['Tronic'], 83)]
    const view = { players: [], result: { reason: 'completed' as const, concededBy: null } }

    expect(battleResult(table, view)).toMatchObject({ kind: 'win', side: table[1], verb: 'wins', score: '83–76' })
  })

  it('has no score to celebrate when the loser conceded', () => {
    const table = [side(0, ['Rago']), side(1, ['Tronic'])]
    const view = { players: [player('rago', 0), player('tronic', 1)], result: { reason: 'conceded' as const, concededBy: 'tronic' } }

    expect(battleResult(table, view)).toMatchObject({ kind: 'win', side: table[0], detail: 'by concession', score: null })
  })

  it('gives a drawn battle nobody to celebrate', () => {
    const table = [side(0, ['Rago'], 83), side(1, ['Tronic'], 83)]
    const view = { players: [], result: { reason: 'completed' as const, concededBy: null } }

    expect(battleResult(table, view)).toEqual({ kind: 'none', detail: 'Drawn at 83' })
  })

  it('uses a plural verb for an allied side', () => {
    const table = [side(0, ['Rago', 'Alice'], 83), side(1, ['Tronic'], 76)]
    const view = { players: [], result: { reason: 'completed' as const, concededBy: null } }

    expect(battleOutcome(table, view)).toBe('Rago & Alice win 83–76')
  })
})
