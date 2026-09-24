import { DEFAULT_GAME_LIMIT } from '../../../core/battle'
import { GUEST_DRAFT_COOKIE } from '../../../contracts/rosterCookies'
import { setRosterCookie } from './rosterCookie'
import type { RosterDraft } from './rosterDraft'
import type { RosterSetup } from './RosterSetupDialog'
import { readWorkspaceState, writeWorkspaceState } from './workspaceState'

/** Where a visitor's list is built, and so where every piece of its tab state is kept. */
export const GUEST_PATH = '/rosters'
const NAME = 'guest-draft'
const VERSION = 1

/** A list a visitor is building, held in this tab until an account saves it. */
export type GuestDraft = { version: typeof VERSION; id: string; draft: Omit<RosterDraft, 'id'> }

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

export function readGuestDraft(): GuestDraft | null {
  const stored = readWorkspaceState<GuestDraft>(GUEST_PATH, NAME)
  if (!stored || stored.version !== VERSION || typeof stored.id !== 'string' || !stored.draft?.catalogueId) return null
  return stored
}

/** Tells the server whether this tab holds a list, so a refresh draws the page it will become. */
export function markGuestDraft(held: boolean) {
  setRosterCookie(GUEST_DRAFT_COOKIE, held ? '1' : null)
}

/** Whether the draft was kept; a full or disabled storage keeps nothing and says so. */
export function writeGuestDraft(draft: GuestDraft) {
  try {
    writeWorkspaceState(GUEST_PATH, NAME, draft)
    markGuestDraft(true)
    return true
  } catch {
    return false
  }
}

/** Forgets the draft and the setup and warning state the builder kept beside it. */
export function clearGuestDraft() {
  for (const name of [NAME, 'roster-setup', 'waivers-dismissed']) writeWorkspaceState(GUEST_PATH, name, null)
  markGuestDraft(false)
}

/** What `saveRoster` is sent to keep a visitor's list under their new account. */
export const claimInput = (guest: GuestDraft): RosterDraft => ({ ...guest.draft, id: guest.id })
