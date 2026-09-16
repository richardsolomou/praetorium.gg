import { describe, expect, it } from 'vitest'
import type { MissionAction } from '../contracts/missions'
import { missionActionReminderStorageKey, missionActionReminders, missionActionRemindersEnabled } from './missionActionReminders'

const action = (name: string): MissionAction => ({
  name,
  starts: 'Your Shooting phase.',
  completes: 'At the end of your turn.',
  effect: null,
  units: 'One unit from your army.',
  useLimit: null,
  restriction: null,
})

const references = new Map([
  ['primary', { key: 'primary', name: 'Primary', actions: [action('Raise the Banner')] }],
  ['active', { key: 'active', name: 'Active', actions: [action('Scan'), action('Transmit')] }],
  ['resolved', { key: 'resolved', name: 'Resolved', actions: [action('Do not remind')] }],
  ['same', { key: 'same', name: 'Cleanse', actions: [action('CLEANSE')] }],
])

describe('mission action reminders', () => {
  it('defaults the per-battle preference on', () => {
    expect([missionActionReminderStorageKey('battle'), missionActionRemindersEnabled(null), missionActionRemindersEnabled('off')]).toEqual([
      'praetorium.action-reminders.battle',
      true,
      false,
    ])
  })

  it('includes every action from the primary and active secondary cards', () => {
    expect(
      missionActionReminders(
        {
          primaryCard: { key: 'primary', name: 'Primary' },
          secondaries: [
            { key: 'active', name: 'Active', status: 'active' },
            { key: 'resolved', name: 'Resolved', status: 'achieved' },
          ],
        },
        (key) => references.get(key),
      ),
    ).toEqual([
      expect.objectContaining({ key: 'mission-action:primary:0', ability: 'Primary: Raise the Banner' }),
      expect.objectContaining({ key: 'mission-action:active:0', ability: 'Active: Scan' }),
      expect.objectContaining({ key: 'mission-action:active:1', ability: 'Active: Transmit' }),
    ])
  })

  it('uses a shooting-phase start timing on the player turn', () => {
    expect(
      missionActionReminders({ primaryCard: { key: 'primary', name: 'Primary' }, secondaries: [] }, (key) => references.get(key))[0]
        ?.timings,
    ).toEqual([{ moment: 'phase-start', phase: 'shooting', turn: 'your-turn' }])
  })

  it('does not repeat an action with the same name as its card', () => {
    expect(
      missionActionReminders({ primaryCard: { key: 'same', name: 'Cleanse' }, secondaries: [] }, (key) => references.get(key))[0]?.ability,
    ).toBe('Cleanse')
  })

  it('keeps the action instructions in the reminder', () => {
    expect(
      missionActionReminders({ primaryCard: { key: 'primary', name: 'Primary' }, secondaries: [] }, (key) => references.get(key))[0]
        ?.description,
    ).toBe('**Starts:** Your Shooting phase.\n\n**Completes:** At the end of your turn.\n\n**Units:** One unit from your army.')
  })

  it('omits cards whose reference or actions are unavailable', () => {
    expect(
      missionActionReminders(
        { primaryCard: { key: 'missing', name: 'Missing' }, secondaries: [{ key: 'active', name: 'Active', status: 'active' }] },
        () => undefined,
      ),
    ).toEqual([])
  })
})
