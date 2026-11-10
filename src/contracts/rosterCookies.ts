/**
 * A cookie that says a visitor's browser holds a list, and nothing about the list.
 *
 * The list itself stays in browser storage, which a server never sees, so without
 * this a refresh drew the empty setup and swapped the builder in after it.
 */
export const GUEST_DRAFT_COOKIE = 'praetorium_guest_draft'

/** The order a player keeps their library in, read by the server so the first frame is already sorted. */
export const ROSTER_SORT_COOKIE = 'praetorium_roster_sort'

/** What a player groups their library by, read by the server so the first frame is already grouped. */
export const ROSTER_GROUPING_COOKIE = 'praetorium_roster_grouping'

/** Whether the library last had a data update notice, read by the server so the first frame keeps the notice's line while it loads. */
export const ROSTER_NOTICES_COOKIE = 'praetorium_roster_notices'

/** How many rows the unfiltered library last showed, read by the server so the first frame reserves that many while it loads. */
export const ROSTER_ROWS_COOKIE = 'praetorium_roster_rows'

/** Whether the builder shelves attached units together, read by the server so the first frame is already arranged. */
export const ROSTER_ARRANGEMENT_COOKIE = 'praetorium_roster_arrangement'
