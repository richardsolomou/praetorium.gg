import type { Secondary, Stratagem } from '../../core/battle'
import type { RosterReminder } from '../../core/reminders'
import { type FrozenRoster, ListBuilder } from '../features/rosters/ListBuilder'

type Roster = {
  id: string
  name: string
  catalogueId: string
  detachmentIds: string[]
  disposition: string | null
  limit: number
  picks: Parameters<typeof ListBuilder>[0]['initial']['picks']
  waivedRules: Parameters<typeof ListBuilder>[0]['initial']['waivedRules']
  prep?: {
    stratagems: Stratagem[]
    secondaries: Secondary[]
    reminders?: RosterReminder[]
    remindersEnabled?: boolean
  } | null
  visibility: Parameters<typeof ListBuilder>[0]['initial']['visibility']
  source: Parameters<typeof ListBuilder>[0]['initial']['source']
}

type Props = {
  roster: Roster
  faction: Parameters<typeof ListBuilder>[0]['initialFaction']
  editable: boolean
  battle?: string
  resolvePersistedRoster?: boolean
  /** The units and total a battle froze, for a list that is read rather than priced. */
  frozen?: FrozenRoster
}

const NO_PREP = { stratagems: [], secondaries: [], reminders: [], remindersEnabled: true }

export function RosterEditor({ roster, faction, editable, battle, resolvePersistedRoster = true, frozen }: Props) {
  return (
    <main className="flex h-full w-full min-w-0 max-w-full flex-col overflow-x-hidden">
      <ListBuilder
        key={roster.id}
        prep={roster.prep ?? NO_PREP}
        initial={roster}
        initialFaction={faction}
        editable={editable}
        battle={battle}
        resolvePersistedRoster={resolvePersistedRoster}
        frozen={frozen}
      />
    </main>
  )
}
