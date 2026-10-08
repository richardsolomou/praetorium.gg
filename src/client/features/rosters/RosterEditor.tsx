import { type FrozenRoster, ListBuilder } from './ListBuilder'

type ListBuilderProps = Parameters<typeof ListBuilder>[0]

type Roster = {
  id: string
  name: string
  automaticName?: boolean
  catalogueId: string
  detachmentIds: string[]
  disposition: string | null
  limit: number
  picks: ListBuilderProps['initial']['picks']
  waivedRules: ListBuilderProps['initial']['waivedRules']
  prep?: ListBuilderProps['prep'] | null
  visibility: ListBuilderProps['initial']['visibility']
  source: ListBuilderProps['initial']['source']
  updatedAt?: number
}

type Props = {
  roster: Roster
  faction: ListBuilderProps['initialFaction']
  editable: boolean
  battle?: string
  resolvePersistedRoster?: boolean
  /** The units and total a battle froze, for a list that is read rather than priced. */
  frozen?: FrozenRoster
  variants?: ListBuilderProps['variants']
  differences?: ListBuilderProps['differences']
  requested?: ListBuilderProps['requested']
}

const NO_PREP = { stratagems: [], secondaries: [], reminders: [], remindersEnabled: true }

export function RosterEditor({
  roster,
  faction,
  editable,
  battle,
  resolvePersistedRoster = true,
  frozen,
  variants,
  differences,
  requested,
}: Props) {
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
        variants={variants}
        differences={differences}
        requested={requested}
      />
    </main>
  )
}
