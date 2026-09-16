import { describe, expect, it } from 'vitest'
import {
  parseReminderDismissals,
  pruneReminderDismissals,
  reminderDismissalKey,
  reminderDismissalKeys,
  reminderDismissalStorageKey,
  serializeReminderDismissals,
} from './reminderDismissals'

const context = { round: 3, activePlayerId: 'player:two', phase: 'fight' } as const

describe('reminder dismissal keys', () => {
  it('stores one bounded record per battle', () => {
    expect(reminderDismissalStorageKey('battle')).toBe('praetorium.reminders.battle')
  })

  it('limits each scope to its battle moment', () => {
    expect(reminderDismissalKeys('ability:key', context)).toEqual([
      'ability%3Akey|phase|3|player%3Atwo|fight',
      'ability%3Akey|turn|3|player%3Atwo',
      'ability%3Akey|round|3',
      'ability%3Akey|battle',
    ])
  })

  it('serializes and parses the record', () => {
    const dismissals = new Set(reminderDismissalKeys('ability:key', context))
    expect(parseReminderDismissals(serializeReminderDismissals(dismissals))).toEqual(dismissals)
  })

  it('ignores invalid stored data', () => {
    expect(parseReminderDismissals('{"not":"an array"}')).toEqual(new Set())
    expect(parseReminderDismissals('["valid",3]')).toEqual(new Set())
  })

  it('prunes phase, turn, and round dismissals after their context expires', () => {
    const next = { round: 4, activePlayerId: 'player:one', phase: 'command' } as const
    const stored = new Set([
      ...reminderDismissalKeys('old', context),
      reminderDismissalKey('current', 'phase', next),
      reminderDismissalKey('current', 'turn', next),
      reminderDismissalKey('current', 'round', next),
      reminderDismissalKey('current', 'battle', next),
    ])

    expect(pruneReminderDismissals(stored, next)).toEqual(
      new Set([
        reminderDismissalKey('old', 'battle', context),
        reminderDismissalKey('current', 'phase', next),
        reminderDismissalKey('current', 'turn', next),
        reminderDismissalKey('current', 'round', next),
        reminderDismissalKey('current', 'battle', next),
      ]),
    )
  })
})
