import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveRosterSchema } from '../../../server/schemas'
import {
  claimInput,
  clearGuestDraft,
  EMPTY_SETUP,
  guestSaveRequested,
  newGuestDraft,
  readGuestDraft,
  requestGuestSave,
  watchGuestDraft,
  writeGuestDraft,
} from './guestDraft'

const KEY = 'praetorium.guest-draft'
const TAB_KEY = 'praetorium.workspace-state:/rosters:guest-draft'

function storage(setItem?: () => void) {
  const entries = new Map<string, string>()
  return {
    entries,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: setItem ?? ((key: string, value: string) => void entries.set(key, value)),
    removeItem: (key: string) => void entries.delete(key),
  }
}

function stubStorage({ refuseDevice = false } = {}) {
  const listeners: ((event: StorageEvent) => void)[] = []
  vi.stubGlobal('window', {
    addEventListener: (_type: string, listener: (event: StorageEvent) => void) => listeners.push(listener),
    removeEventListener: () => {},
  })
  const device = storage(
    refuseDevice
      ? () => {
          throw new Error('QuotaExceededError')
        }
      : undefined,
  )
  const tab = storage()
  vi.stubGlobal('localStorage', device)
  vi.stubGlobal('sessionStorage', tab)
  const otherTabWrites = (key: string | null, newValue: string | null) =>
    listeners.forEach((listener) => listener({ key, newValue } as StorageEvent))
  return { device: device.entries, tab: tab.entries, otherTabWrites }
}

const setup = { ...EMPTY_SETUP, catalogueId: 'necrons', visibility: 'public' as const }
const HOUR = 60 * 60 * 1000
const CURRENT_MARINE_IDS = { catalogueId: 'e0af-67df-9d63-8fb7', picks: [{ entryId: '85b1-eb9a-17a6-e5be' }] }

function retiredMarineDraft() {
  const draft = newGuestDraft({ ...setup, catalogueId: 'e0af-67df-9d63-8fb8' })
  return { ...draft, draft: { ...draft.draft, picks: [{ entryId: 'profile-unit-e0af-67df-9d63-8fb8-34c7-75dd-fcff-ec94' }] } }
}

describe("a visitor's draft", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads back the list that was written', () => {
    stubStorage()
    const draft = newGuestDraft(setup)
    writeGuestDraft(draft)
    expect(readGuestDraft()).toEqual(draft)
  })

  it('is kept on the device rather than in the tab', () => {
    const { device } = stubStorage()
    writeGuestDraft(newGuestDraft(setup))
    expect([...device.keys()]).toEqual([KEY])
  })

  it('moves a draft still held in the tab onto the device', () => {
    const { device, tab } = stubStorage()
    const draft = newGuestDraft(setup)
    tab.set(TAB_KEY, JSON.stringify(draft))
    readGuestDraft()
    expect([JSON.parse(device.get(KEY)!), tab.has(TAB_KEY)]).toEqual([draft, false])
  })

  it('ignores a stored draft that is not JSON', () => {
    const { device } = stubStorage()
    device.set(KEY, '{')
    expect(readGuestDraft()).toBeNull()
  })

  it('reads a draft built on the retired Marine codex under current ids', () => {
    stubStorage()
    writeGuestDraft(retiredMarineDraft())
    expect(readGuestDraft()?.draft).toMatchObject(CURRENT_MARINE_IDS)
  })

  it('moves a tab draft built on the retired Marine codex onto the device under current ids', () => {
    const { device, tab } = stubStorage()
    tab.set(TAB_KEY, JSON.stringify(retiredMarineDraft()))
    readGuestDraft()
    expect(JSON.parse(device.get(KEY)!).draft).toMatchObject(CURRENT_MARINE_IDS)
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
    const { device } = stubStorage()
    writeGuestDraft(newGuestDraft(setup))
    device.set(KEY, JSON.stringify({ ...JSON.parse(device.get(KEY)!), version: 0 }))
    expect(readGuestDraft()).toBeNull()
  })

  it('reports a browser that will not keep it', () => {
    stubStorage({ refuseDevice: true })
    expect(writeGuestDraft(newGuestDraft(setup))).toBe(false)
  })

  it('forgets the draft and the tab state kept beside it', () => {
    const { device, tab } = stubStorage()
    writeGuestDraft(newGuestDraft(setup))
    tab.set('praetorium.workspace-state:/rosters:roster-setup', '{}')
    clearGuestDraft()
    expect(device.size + tab.size).toBe(0)
  })
})

describe('saving a draft after signing in', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('is not requested for a draft the visitor never sent to sign-in', () => {
    expect(guestSaveRequested(newGuestDraft(setup), 0)).toBe(false)
  })

  it('is requested when sign-in was submitted from the save prompt', () => {
    stubStorage()
    writeGuestDraft(newGuestDraft(setup))
    requestGuestSave(1_000)
    expect(guestSaveRequested(readGuestDraft()!, 1_000 + HOUR - 1)).toBe(true)
  })

  it('is no longer requested an hour after that sign-in', () => {
    stubStorage()
    writeGuestDraft(newGuestDraft(setup))
    requestGuestSave(1_000)
    expect(guestSaveRequested(readGuestDraft()!, 1_000 + HOUR)).toBe(false)
  })

  it('is not requested by a request dated after the arrival', () => {
    expect(guestSaveRequested({ ...newGuestDraft(setup), saveRequestedAt: 2_000 }, 1_000)).toBe(false)
  })
})

describe('a draft open in two tabs', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('hears the list another tab wrote', () => {
    const { otherTabWrites } = stubStorage()
    const heard: unknown[] = []
    watchGuestDraft((guest) => heard.push(guest))
    const draft = newGuestDraft(setup)
    otherTabWrites(KEY, JSON.stringify(draft))
    expect(heard).toEqual([draft])
  })

  it('hears another tab clear the list', () => {
    const { otherTabWrites } = stubStorage()
    const heard: unknown[] = []
    watchGuestDraft((guest) => heard.push(guest))
    otherTabWrites(KEY, null)
    expect(heard).toEqual([null])
  })

  it('does not hear back the list this tab already holds', () => {
    const { otherTabWrites } = stubStorage()
    const draft = newGuestDraft(setup)
    writeGuestDraft(draft)
    const heard: unknown[] = []
    watchGuestDraft((guest) => heard.push(guest))
    otherTabWrites(KEY, JSON.stringify(draft))
    expect(heard).toEqual([])
  })

  it('ignores other storage keys', () => {
    const { otherTabWrites } = stubStorage()
    const heard: unknown[] = []
    watchGuestDraft((guest) => heard.push(guest))
    otherTabWrites('praetorium.other', '{}')
    expect(heard).toEqual([])
  })
})
