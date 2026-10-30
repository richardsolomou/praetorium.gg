export const ROSTER_LIBRARY_BATCH_SIZE = 20
/** The most rosters one library action on a selection changes together. */
export const ROSTER_BATCH_MAX = 100

/** What each library action on a selection sets on every chosen roster; `delete` removes them instead. */
export const ROSTER_BATCH_CHANGES = {
  archive: { archived: true },
  unarchive: { archived: false },
  lock: { locked: true },
  unlock: { locked: false },
  private: { visibility: 'private' },
  unlisted: { visibility: 'unlisted' },
} as const

export const ROSTER_BATCH_ACTIONS = ['archive', 'unarchive', 'lock', 'unlock', 'private', 'unlisted', 'delete'] as const
export type RosterBatchAction = (typeof ROSTER_BATCH_ACTIONS)[number]
