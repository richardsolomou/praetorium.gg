import { ROSTER_VISIBILITIES, type RosterVisibility } from '../../../core/savedRoster'

/**
 * What each answer is called, and what it means.
 *
 * One place for the words, read by the badge on a library row and by the control
 * that sets them. Two copies drifted apart, and a value with no branch of its own
 * labelled itself as whichever branch came last.
 */
export const VISIBILITY_NAME: Record<RosterVisibility, string> = {
  private: 'Private',
  unlisted: 'Unlisted',
  public: 'Public',
}

/** Worded as consequences, because the choice is only useful if a player can tell what changes. */
export const VISIBILITY_REACH: Record<RosterVisibility, string> = {
  private: 'Only you',
  unlisted: 'Anyone with the link',
  public: 'Listed on your profile',
}

export const VISIBILITY_DETAIL = Object.fromEntries(
  ROSTER_VISIBILITIES.map((visibility) => [visibility, `${VISIBILITY_NAME[visibility]} — ${VISIBILITY_REACH[visibility].toLowerCase()}`]),
) as Record<RosterVisibility, string>
