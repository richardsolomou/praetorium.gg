import { describe, expect, it } from 'vitest'
import { sealedEventCombatPairing } from './SealedEventCombatDialog'

const teams = [
  ['ana', 'ben'],
  ['cy', 'di'],
]

describe('the pairing a doubles comparison opens with', () => {
  it('sets your team against your opponent’s team', () => {
    expect(sealedEventCombatPairing(teams, 'ana', 'di')).toEqual({ attacker: ['ana', 'ben'], defender: ['cy', 'di'] })
  })

  it('keeps single rosters for a player without a pair', () => {
    expect(sealedEventCombatPairing(teams, 'solo', 'cy')).toEqual({ attacker: ['solo'], defender: ['cy', 'di'] })
  })

  it('compares against a teammate alone rather than against your own team', () => {
    expect(sealedEventCombatPairing(teams, 'ana', 'ben')).toEqual({ attacker: ['ana'], defender: ['ben'] })
  })
})
