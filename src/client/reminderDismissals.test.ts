import { describe, expect, it } from 'vitest'
import { reminderDismissalKey, reminderDismissalKeys } from './reminderDismissals'

const context = { round: 3, activePlayerId: 'player:two', phase: 'fight' } as const

describe('reminder dismissal keys', () => {
  it('limits a phase dismissal to the active turn and phase', () => {
    expect(reminderDismissalKey('battle', 'ability:key', 'phase', context)).toBe(
      'praetorium.reminder.battle.ability%3Akey.phase.3.player:two.fight',
    )
  })

  it('limits a turn dismissal to the active player turn', () => {
    expect(reminderDismissalKey('battle', 'ability:key', 'turn', context)).toBe(
      'praetorium.reminder.battle.ability%3Akey.turn.3.player:two',
    )
  })

  it('limits a round dismissal to the current round', () => {
    expect(reminderDismissalKey('battle', 'ability:key', 'round', context)).toBe('praetorium.reminder.battle.ability%3Akey.round.3')
  })

  it('keeps a battle dismissal independent of turn progress', () => {
    expect(reminderDismissalKey('battle', 'ability:key', 'battle', context)).toBe('praetorium.reminder.battle.ability%3Akey.battle')
  })

  it('returns every dismissal that can cover the current phase', () => {
    expect(reminderDismissalKeys('battle', 'ability:key', context)).toEqual([
      'praetorium.reminder.battle.ability%3Akey.phase.3.player:two.fight',
      'praetorium.reminder.battle.ability%3Akey.turn.3.player:two',
      'praetorium.reminder.battle.ability%3Akey.round.3',
      'praetorium.reminder.battle.ability%3Akey.battle',
    ])
  })
})
