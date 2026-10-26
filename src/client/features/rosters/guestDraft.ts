import { DEFAULT_GAME_LIMIT } from '../../../core/battle'
import { GUEST_DRAFT_COOKIE } from '../../../contracts/rosterCookies'
import { setRosterCookie } from './rosterCookie'
import type { RosterDraft } from './rosterDraft'
import type { RosterSetup } from './RosterSetupDialog'
import {
  parseWorkspaceState,
  readStoredWorkspaceState,
  readWorkspaceState,
  SETUP_STATE,
  WAIVERS_STATE,
  writeWorkspaceState,
} from './workspaceState'
import { currentRosterIds } from '../../../core/retiredCatalogueIds'
import { listUnitCount } from '../../../core/attachedUnits'
import { requireReviewedRoster } from '../../offline/reviewedRoster'

/** The rosters page, where a visitor's list is listed and where signing in saves it to the account. */
export const GUEST_PATH = '/rosters'
const NAME = 'guest-draft'
const KEY = 'praetorium.guest-draft'
const VERSION = 1
/** How long after asking to save a sign-in still counts as that request, rather than a later visit. */
const SAVE_REQUEST_WINDOW_MS = 60 * 60 * 1000

/**
 * A list a visitor is building, kept on this device until an account saves it.
 *
 * `saveRequestedAt` records when the visitor last submitted sign-in from the save prompt; drafts from before
 * `updatedAt` was kept have none.
 */
export type GuestDraft = {
  version: typeof VERSION
  id: string
  draft: Omit<RosterDraft, 'id'>
  updatedAt?: number
  saveRequestedAt?: number
}

let lastWritten: string | null = null

/** The builder's address for a visitor's list, which is the one the list keeps once an account saves it under its id. */
const guestDraftPath = (guest: Pick<GuestDraft, 'id'>) => `/rosters/${guest.id}`

export const EMPTY_SETUP: RosterSetup = {
  name: '',
  catalogueId: '',
  detachmentIds: [],
  disposition: null,
  limit: DEFAULT_GAME_LIMIT,
  pointsBudget: null,
  waivedRules: [],
  optionalRules: [],
  borrowedDetachmentId: null,
  visibility: 'private',
}

/**
 * A visitor's list from a setup, an import or a copy. It stays private in this browser; claiming it applies the
 * player's default visibility.
 *
 * Its id is made here because saving a list by an id its owner already holds updates that row, so a claim that is
 * sent again after a reload lands on the list it already made rather than a second one.
 */
export function guestDraftOf(draft: Omit<RosterDraft, 'id'>): GuestDraft {
  return { version: VERSION, id: crypto.randomUUID(), draft: { ...draft, visibility: 'private' }, updatedAt: Date.now() }
}

export const newGuestDraft = (setup: RosterSetup) => guestDraftOf({ ...setup, picks: [], prep: null, source: 'editable' })

/** The draft as the rosters page lists a saved one: private, and never locked, archived or a variant. */
export function guestRosterSummary(guest: GuestDraft) {
  const { draft } = guest
  // A draft from before edits were dated reads as edited now rather than in 1970.
  const updatedAt = guest.updatedAt ?? Date.now()
  return {
    id: guest.id,
    name: draft.name,
    automaticName: !draft.name,
    catalogueId: draft.catalogueId,
    detachmentIds: draft.detachmentIds,
    disposition: draft.disposition,
    limit: draft.limit,
    pointsBudget: draft.pointsBudget ?? null,
    waivedRules: draft.waivedRules ?? [],
    optionalRules: draft.optionalRules ?? [],
    borrowedDetachmentId: draft.borrowedDetachmentId ?? null,
    baseRosterId: null,
    locked: false,
    archived: false,
    visibility: 'private' as const,
    source: draft.source ?? 'editable',
    createdAt: updatedAt,
    updatedAt,
    unitCount: listUnitCount(draft.picks),
  }
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
  if (tab && writeGuestDraft(tab)) writeWorkspaceState(GUEST_PATH, NAME, null)
  return tab
}

let peeked: { stored: string | null; tab: string | null; guest: GuestDraft | null } | null = null

/**
 * The draft `readGuestDraft` would return, without moving a tab's copy to the device, for rendering; it returns the
 * same object until either copy changes, as `useSyncExternalStore` needs.
 */
export function peekGuestDraft(): GuestDraft | null {
  let stored: string | null = null
  try {
    stored = localStorage.getItem(KEY)
  } catch {
    // Storage the browser refuses to read holds no draft; the tab's copy may still.
  }
  const tab = readStoredWorkspaceState(GUEST_PATH, NAME)
  if (peeked?.stored !== stored || peeked.tab !== tab)
    peeked = { stored, tab, guest: parseDraft(stored) ?? validDraft(parseWorkspaceState<GuestDraft>(tab)) }
  return peeked.guest
}

/** Tells the server whether this browser holds a list, so a refresh draws the page it will become. */
export function markGuestDraft(held: boolean) {
  setRosterCookie(GUEST_DRAFT_COOKIE, held ? '1' : null)
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

/**
 * Keeps an edit from the builder, dated now. One that changes nothing is not written, since another tab hears every
 * write as a change and would start its builder again.
 */
export function editGuestDraft(guest: GuestDraft, draft: GuestDraft['draft']) {
  const kept = readGuestDraft()
  if (kept?.id === guest.id && JSON.stringify(kept.draft) === JSON.stringify(draft)) return true
  return writeGuestDraft({ ...guest, draft, updatedAt: Date.now() })
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
  const kept = readGuestDraft()
  forget(() => localStorage.removeItem(KEY))
  lastWritten = null
  writeWorkspaceState(GUEST_PATH, NAME, null)
  if (kept) for (const name of [SETUP_STATE, WAIVERS_STATE]) writeWorkspaceState(guestDraftPath(kept), name, null)
  markGuestDraft(false)
}

/** Keeps a reviewed setup change, refused when another tab changed the list after the review began. */
export function keepReviewedDraft(guest: GuestDraft, { id: _id, ...draft }: RosterDraft, source: RosterDraft) {
  const latest = readGuestDraft()
  requireReviewedRoster(latest?.id === guest.id ? latest.draft : null, { ...source, id: undefined })
  return writeGuestDraft({ ...guest, draft, updatedAt: Date.now() })
}

/** What `saveRoster` is sent to keep a visitor's list under their new account. */
export const claimInput = (guest: GuestDraft): RosterDraft => ({ ...guest.draft, id: guest.id })
