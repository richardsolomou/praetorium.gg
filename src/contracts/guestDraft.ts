/**
 * A session cookie that says a visitor's tab holds a list, and nothing about the list.
 *
 * The list itself stays in the tab's session storage, which a server never sees, so
 * without this a refresh drew the empty setup and swapped the builder in after it.
 */
export const GUEST_DRAFT_COOKIE = 'praetorium_guest_draft'
