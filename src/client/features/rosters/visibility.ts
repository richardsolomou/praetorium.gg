import type { RosterVisibility } from '../../../core/savedRoster'

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
export const VISIBILITY_DETAIL: Record<RosterVisibility, string> = {
  private: 'Private — only you',
  unlisted: 'Unlisted — anyone with the link',
  public: 'Public — listed on your profile',
}
