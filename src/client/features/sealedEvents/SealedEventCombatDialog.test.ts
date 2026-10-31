import { describe, expect, it } from 'vitest'
import { sealedEventCombatPairing } from './SealedEventCombatDialog'

const teams = [
  { id: 'team:1', label: 'Team 1: Ana and Ben', userIds: ['ana', 'ben'] },
  { id: 'team:2', label: 'Team 2: Cy and Di', userIds: ['cy', 'di'] },
]

describe('the pairing a doubles comparison opens with', () => {
  it('sets your team against your opponent’s team', () => {
    expect(sealedEventCombatPairing(teams, 'ana', 'di')).toEqual({ attacker: 'team:1', defender: 'team:2' })
  })

  it('keeps single rosters for a player without a pair', () => {
    expect(sealedEventCombatPairing(teams, 'solo', 'cy')).toEqual({ attacker: 'solo', defender: 'team:2' })
  })

  it('compares against a teammate alone rather than against your own team', () => {
    expect(sealedEventCombatPairing(teams, 'ana', 'ben')).toEqual({ attacker: 'ana', defender: 'ben' })
  })
})
