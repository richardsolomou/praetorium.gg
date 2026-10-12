import { ROSTER_VISIBILITIES, type RosterVisibility } from '../../../core/savedRoster'

export const VISIBILITY_NAME: Record<RosterVisibility, string> = {
  private: 'Private',
  unlisted: 'Unlisted',
  public: 'Public',
}

export const VISIBILITY_REACH: Record<RosterVisibility, string> = {
  private: 'You and seated players through a battle using this list',
  unlisted: 'Anyone with the link',
  public: 'Listed on your profile',
}

export const VISIBILITY_DETAIL = Object.fromEntries(
  ROSTER_VISIBILITIES.map((visibility) => [
    visibility,
    visibility === 'private'
      ? VISIBILITY_NAME[visibility]
      : `${VISIBILITY_NAME[visibility]} — ${VISIBILITY_REACH[visibility].toLowerCase()}`,
  ]),
) as Record<RosterVisibility, string>
