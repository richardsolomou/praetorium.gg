import type { RosterVisibility } from '../../../core/savedRoster'
import { VISIBILITY_ICON, VISIBILITY_NAME } from './visibility'

/** Who can see a roster, shown beside its Share menu item. */
export function VisibilityTag({ visibility }: { visibility: RosterVisibility }) {
  const Icon = VISIBILITY_ICON[visibility]
  return (
    <span className="ml-auto flex items-center gap-1 pl-4 text-2xs text-faint">
      <Icon className="size-3" /> {VISIBILITY_NAME[visibility]}
    </span>
  )
}
