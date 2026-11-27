import { describe, expect, it } from 'vitest'
import type { RosterPick, VsPick } from './roster'
import { nextSavedPicks, savedPickKey, savedPicksPinSchema, withVsPicks } from './savedPicks'

const context = { rulesVersion: 'mfm-1-6', catalogueId: 'book', detachmentIds: ['gladius'] }
const pick: RosterPick = { entryId: 'intercessors', models: 10, choices: { 'squad/sergeant': 'plasma-pistol' } }
const vs: VsPick = { models: { 'space-marines.intercessor': 10 }, options: {} }
const translated = (picks: RosterPick[]) => {
  const key = savedPickKey(context, pick)
  return withVsPicks({ catalogueId: 'book', detachmentIds: ['gladius'], picks }, 'mfm-1-6', (wanted) => (wanted === key ? vs : undefined))
    .picks
}

describe('savedPickKey', () => {
  it('ignores what a player names, notes, attaches or embarks', () => {
    expect(savedPickKey(context, { ...pick, nickname: 'Fist', note: 'left flank', attachedTo: 2, embarkedIn: 3 })).toBe(
      savedPickKey(context, pick),
    )
  })

  it('reads an allied book that is the list’s own, a toggle off and an empty record as the plain pick', () => {
    expect(savedPickKey(context, { ...pick, catalogueId: 'mfm-1-6~book', toggles: { warlord: 0 }, spreads: {} })).toBe(
      savedPickKey(context, pick),
    )
  })

  it('reads a choice saved in another key order as the same pick', () => {
    const two = { a: 'x', b: 'y' }
    expect(savedPickKey(context, { ...pick, choices: { b: 'y', a: 'x' } })).toBe(savedPickKey(context, { ...pick, choices: two }))
  })

  it('tells a pick changed after the freeze from the frozen one', () => {
    expect(savedPickKey(context, { ...pick, choices: { 'squad/sergeant': 'hand-flamer' } })).not.toBe(savedPickKey(context, pick))
  })

  it('tells the same pick in another rules version apart', () => {
    expect(savedPickKey({ ...context, rulesVersion: 'legacy-rosters' }, pick)).not.toBe(savedPickKey(context, pick))
  })
})

describe('withVsPicks', () => {
  it('attaches the frozen translation and keeps every stored field', () => {
    expect(translated([{ ...pick, nickname: 'Fist' }])).toEqual([{ ...pick, nickname: 'Fist', vs }])
  })

  it('keeps a pick saved by VS Data IDs as it is', () => {
    const own: VsPick = { models: { 'space-marines.intercessor': 5 }, options: {} }
    expect(translated([{ ...pick, vs: own }])[0]?.vs).toBe(own)
  })
})

describe('nextSavedPicks', () => {
  const published = { format: 'praetorium.saved-picks.v1' as const, picks: { '0123456789abcdef': vs } }
  const none = new Set<string>()

  it('holds only the keys of the copy it publishes', () => {
    expect(Object.keys(JSON.parse(nextSavedPicks(published, { fedcba9876543210: vs }, none, none)).picks)).toEqual(['fedcba9876543210'])
  })

  it('stops a run that would change what a published key means', () => {
    const changed = { '0123456789abcdef': { ...vs, models: { 'space-marines.intercessor': 5 } } }
    expect(() => nextSavedPicks(published, changed, none, none)).toThrow()
  })

  it('stops a run that leaves out a published key a live record still holds', () => {
    expect(() => nextSavedPicks(published, {}, new Set(['0123456789abcdef']), none)).toThrow()
  })

  it('lets a run leave out a key its copy reads two ways', () => {
    const disputed = new Set(['0123456789abcdef'])
    expect(JSON.parse(nextSavedPicks(published, {}, disputed, disputed)).picks).toEqual({})
  })

  it('refuses anything beside a pick’s content key and its VS Data IDs', () => {
    expect(() => nextSavedPicks(null, { '0123456789abcdef': { ...vs, list: 'r-1' } as VsPick }, none, none)).toThrow()
  })
})

describe('savedPicksPinSchema', () => {
  it('refuses a pin that does not say when its copy’s backup was taken', () => {
    expect(() => savedPicksPinSchema.parse({ format: 'praetorium.saved-picks-pin.v1', sha256: '0'.repeat(64) })).toThrow()
  })
})
