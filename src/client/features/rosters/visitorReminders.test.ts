import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ABILITY_REMINDERS_MAX } from '../../../core/reminders'
import { abilityReminders, setAbilityReminder } from '../../functions'
import {
  adoptVisitorReminders,
  claimVisitorReminders,
  parseVisitorReminders,
  VISITOR_REMINDERS_KEY,
  visitorFieldingReminders,
  writeVisitorReminders,
} from './visitorReminders'

const stored = vi.hoisted(() => new Map<string, string | null>())
vi.mock('../../storedValue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../storedValue')>()),
  readStoredValue: (key: string) => stored.get(key) ?? null,
  writeStoredValue: (key: string, value: string | null) => void stored.set(key, value),
}))
vi.mock('../../functions', () => ({ abilityReminders: vi.fn(), setAbilityReminder: vi.fn() }))

const timings = [{ moment: 'turn-start' as const, phase: null, turn: 'your-turn' as const }]
const alert = (key: string) => ({ key, ability: key, description: '', timings })
const legacy = [{ ...alert('datasheet:shroud:2'), unit: { index: 2, name: 'Lord' } }]
const kept = () => parseVisitorReminders(stored.get(VISITOR_REMINDERS_KEY) ?? null)

beforeEach(() => {
  stored.clear()
  vi.mocked(abilityReminders).mockReset().mockResolvedValue([])
  vi.mocked(setAbilityReminder).mockReset().mockResolvedValue(null)
})

describe('adopting the alerts an older build kept in a visitor’s list', () => {
  it('keeps them by ability', () => {
    adoptVisitorReminders(legacy)
    expect(kept()?.map((reminder) => reminder.key)).toEqual(['datasheet:shroud'])
  })

  it('never replaces the alerts this browser keeps', () => {
    writeVisitorReminders([alert('datasheet:other')])
    adoptVisitorReminders(legacy)
    expect(kept()?.map((reminder) => reminder.key)).toEqual(['datasheet:other'])
  })

  it('never brings back alerts the visitor removed', () => {
    writeVisitorReminders([])
    adoptVisitorReminders(legacy)
    expect(kept()).toEqual([])
  })
})

describe('the alerts a visitor’s draft fields with', () => {
  it('includes the ones the draft kept per unit', () => {
    expect(visitorFieldingReminders(legacy)?.map((reminder) => reminder.key)).toEqual(['datasheet:shroud'])
  })

  it('leaves the choice to the server when this browser keeps none', () => {
    expect(visitorFieldingReminders(undefined)).toBeUndefined()
  })
})

describe('claiming a visitor’s alerts for the account that saved their list', () => {
  it('never resends an alert the account holds', async () => {
    writeVisitorReminders([alert('datasheet:held'), alert('datasheet:new')])
    vi.mocked(abilityReminders).mockResolvedValue([alert('datasheet:held')])
    await claimVisitorReminders()
    expect(vi.mocked(setAbilityReminder).mock.calls.map(([args]) => args.data.key)).toEqual(['datasheet:new'])
  })

  it('clears this browser’s alerts once the account has them', async () => {
    writeVisitorReminders([alert('datasheet:new')])
    await claimVisitorReminders()
    expect(kept()).toEqual([])
  })

  it('stops at the account’s limit', async () => {
    writeVisitorReminders([alert('datasheet:new')])
    vi.mocked(abilityReminders).mockResolvedValue(Array.from({ length: ABILITY_REMINDERS_MAX }, (_, at) => alert(`datasheet:${at}`)))
    await claimVisitorReminders()
    expect(setAbilityReminder).not.toHaveBeenCalled()
  })

  it('keeps an alert the account refused in this browser', async () => {
    writeVisitorReminders([alert('datasheet:new')])
    vi.mocked(setAbilityReminder).mockRejectedValue(new Error('full'))
    await claimVisitorReminders()
    expect(kept()?.map((reminder) => reminder.key)).toEqual(['datasheet:new'])
  })

  it('never fails the save when the account’s alerts cannot be read', async () => {
    writeVisitorReminders([alert('datasheet:new')])
    vi.mocked(abilityReminders).mockRejectedValue(new Error('offline'))
    await expect(claimVisitorReminders()).resolves.toBeUndefined()
  })
})
