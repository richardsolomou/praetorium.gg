import { DEFAULT_GAME_LIMIT } from '../../../core/battle'
import { GUEST_DRAFT_COOKIE } from '../../../contracts/rosterCookies'
import { setRosterCookie } from './rosterCookie'
import type { RosterDraft } from './rosterDraft'
import type { RosterSetup } from './RosterSetupDialog'
import { readWorkspaceState, writeWorkspaceState } from './workspaceState'
import { currentRosterIds } from '../../../core/retiredCatalogueIds'

/** Where a visitor's list is built, and so where every piece of its tab state is kept. */
export const GUEST_PATH = '/rosters'
const NAME = 'guest-draft'
const KEY = 'praetorium.guest-draft'
const VERSION = 1
/** How long after asking to save a sign-in still counts as that request, rather than a later visit. */
const SAVE_REQUEST_WINDOW_MS = 60 * 60 * 1000
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/**
 * A list a visitor is building, kept on this device until an account saves it.
 *
 * `saveRequestedAt` records when the visitor last submitted sign-in from the save prompt.
 */
export type GuestDraft = { version: typeof VERSION; id: string; draft: Omit<RosterDraft, 'id'>; saveRequestedAt?: number }

let openDraft: boolean | null = null
let lastWritten: string | null = null
const listeners = new Set<() => void>()

export function subscribeGuestDraft(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function guestDraftOpen(hinted: boolean) {
  return openDraft ?? hinted
}

export function setGuestDraftOpen(open: boolean) {
  if (openDraft === open) return
  openDraft = open
  listeners.forEach((listener) => listener())
}

export const EMPTY_SETUP: RosterSetup = {
  name: '',
  catalogueId: '',
  detachmentIds: [],
  disposition: null,
  limit: DEFAULT_GAME_LIMIT,
  waivedRules: [],
  optionalRules: [],
  borrowedDetachmentId: null,
  visibility: 'private',
}

/**
 * An id made in the browser, so the list can be saved under it once and only once.
 *
 * Saving a list by an id its owner already holds updates that row, so a claim that is
 * sent again after a reload lands on the list it already made rather than a second one.
 */
function draftId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}

/** A new list from a visitor's setup. It is private, as every list starts. */
export function newGuestDraft(setup: RosterSetup): GuestDraft {
  return { version: VERSION, id: draftId(), draft: { ...setup, visibility: 'private', picks: [], prep: null, source: 'editable' } }
}

function validDraft(stored: GuestDraft | null): GuestDraft | null {
  if (!stored || stored.version !== VERSION || typeof stored.id !== 'string' || !stored.draft?.catalogueId) return null
  return { ...stored, draft: currentRosterIds(stored.draft) }
}

function parseDraft(raw: string | null): GuestDraft | null {
  try {
    return validDraft(JSON.parse(raw ?? 'null'))
  } catch {
    return null
  }
}

/** The device's draft, or one still held in this tab's session storage, which moves to the device. */
export function readGuestDraft(): GuestDraft | null {
  if (typeof window === 'undefined') return null
  try {
    const kept = parseDraft(localStorage.getItem(KEY))
    if (kept) return kept
  } catch {
    // Storage the browser refuses to read holds no draft; the tab's copy below may still.
  }
  const tab = validDraft(readWorkspaceState<GuestDraft>(GUEST_PATH, NAME))
  if (tab && writeGuestDraft(tab)) forget(() => writeWorkspaceState(GUEST_PATH, NAME, null))
  return tab
}

/** Tells the server whether this browser holds a list, so a refresh draws the page it will become. */
export function markGuestDraft(held: boolean) {
  setRosterCookie(GUEST_DRAFT_COOKIE, held ? '1' : null, COOKIE_MAX_AGE)
}

/** Whether the draft was kept; a full or disabled storage keeps nothing and says so. */
export function writeGuestDraft(draft: GuestDraft) {
  try {
    const raw = JSON.stringify(draft)
    localStorage.setItem(KEY, raw)
    lastWritten = raw
    markGuestDraft(true)
    return true
  } catch {
    return false
  }
}

/** Records that the visitor is signing in to save the draft, so arriving signed in saves it without asking. */
export function requestGuestSave(now = Date.now()) {
  const guest = readGuestDraft()
  if (guest) writeGuestDraft({ ...guest, saveRequestedAt: now })
}

/** Whether a signed-in arrival follows the visitor's own save request rather than finding a draft left on the device. */
export function guestSaveRequested(guest: GuestDraft, now = Date.now()) {
  const since = now - (guest.saveRequestedAt ?? Number.NEGATIVE_INFINITY)
  return since >= 0 && since < SAVE_REQUEST_WINDOW_MS
}

/** Calls `listener` with the draft another tab wrote or cleared, skipping a write this tab already made. */
export function watchGuestDraft(listener: (guest: GuestDraft | null) => void) {
  const changed = (event: StorageEvent) => {
    if (event.key !== KEY && event.key !== null) return
    if (event.newValue !== null && event.newValue === lastWritten) return
    lastWritten = event.newValue
    listener(parseDraft(event.newValue))
  }
  window.addEventListener('storage', changed)
  return () => window.removeEventListener('storage', changed)
}

function forget(remove: () => void) {
  try {
    remove()
  } catch {
    // A draft that cannot be removed is claimed again under the same id, which updates that one row.
  }
}

/** Forgets the draft and the setup and warning state the builder kept beside it. */
export function clearGuestDraft() {
  forget(() => localStorage.removeItem(KEY))
  lastWritten = null
  for (const name of [NAME, 'roster-setup', 'waivers-dismissed']) forget(() => writeWorkspaceState(GUEST_PATH, name, null))
  markGuestDraft(false)
  setGuestDraftOpen(false)
}

/** What `saveRoster` is sent to keep a visitor's list under their new account. */
export const claimInput = (guest: GuestDraft): RosterDraft => ({ ...guest.draft, id: guest.id })
