import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveRosterSchema } from '../../../server/schemas'
import { claimInput, clearGuestDraft, EMPTY_SETUP, newGuestDraft, readGuestDraft, writeGuestDraft } from './guestDraft'

function stubSessionStorage(setItem?: () => void) {
  const entries = new Map<string, string>()
  vi.stubGlobal('window', {})
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: setItem ?? ((key: string, value: string) => entries.set(key, value)),
    removeItem: (key: string) => entries.delete(key),
  })
  return entries
}

const setup = { ...EMPTY_SETUP, catalogueId: 'necrons', visibility: 'public' as const }

describe("a visitor's draft", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads back the list that was written', () => {
    stubSessionStorage()
    const draft = newGuestDraft(setup)
    writeGuestDraft(draft)
    expect(readGuestDraft()).toEqual(draft)
  })

  it('starts private, whatever the setup asked for', () => {
    expect(newGuestDraft(setup).draft.visibility).toBe('private')
  })

  it('gives every draft its own id', () => {
    expect(newGuestDraft(setup).id).not.toBe(newGuestDraft(setup).id)
  })

  it('is a list the save endpoint accepts', () => {
    expect(saveRosterSchema.safeParse(claimInput(newGuestDraft(setup))).success).toBe(true)
  })

  it('ignores a stored draft from another version', () => {
    const entries = stubSessionStorage()
    writeGuestDraft(newGuestDraft(setup))
    const [key, value] = [...entries][0]!
    entries.set(key, JSON.stringify({ ...JSON.parse(value), version: 0 }))
    expect(readGuestDraft()).toBeNull()
  })

  it('reports a browser that will not keep it', () => {
    stubSessionStorage(() => {
      throw new Error('QuotaExceededError')
    })
    expect(writeGuestDraft(newGuestDraft(setup))).toBe(false)
  })

  it('forgets the draft and the tab state kept beside it', () => {
    const entries = stubSessionStorage()
    writeGuestDraft(newGuestDraft(setup))
    entries.set('praetorium.workspace-state:/rosters/new:roster-setup', '{}')
    clearGuestDraft()
    expect(entries.size).toBe(0)
  })
})
