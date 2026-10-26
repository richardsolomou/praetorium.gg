import { type FrozenRoster, ListBuilder } from './ListBuilder'
import { NO_PREP } from './rosterDraft'

type ListBuilderProps = Parameters<typeof ListBuilder>[0]

type Roster = {
  id: string
  name: string
  automaticName?: boolean
  catalogueId: string
  detachmentIds: string[]
  disposition: string | null
  limit: number
  pointsBudget?: number | null
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
  snapshotEdition?: ListBuilderProps['snapshotEdition']
  editable: boolean
  locked?: boolean
  print?: boolean
  battle?: string
  simulatorSource?: ListBuilderProps['simulatorSource']
  resolvePersistedRoster?: boolean
  /** The units and total a battle froze, for a list that is read rather than priced. */
  frozen?: FrozenRoster
  variants?: ListBuilderProps['variants']
  differences?: ListBuilderProps['differences']
  copiedFrom?: ListBuilderProps['copiedFrom']
  lentBy?: ListBuilderProps['lentBy']
  requested?: ListBuilderProps['requested']
}

export function RosterEditor({
  roster,
  faction,
  snapshotEdition,
  editable,
  locked,
  print,
  battle,
  simulatorSource,
  resolvePersistedRoster = true,
  frozen,
  variants,
  differences,
  copiedFrom,
  lentBy,
  requested,
}: Props) {
  return (
    <main className="flex h-full w-full min-w-0 max-w-full flex-col overflow-x-hidden">
      <ListBuilder
        key={roster.id}
        prep={roster.prep ?? NO_PREP}
        initial={roster}
        initialFaction={faction}
        snapshotEdition={snapshotEdition}
        editable={editable}
        locked={locked}
        print={print}
        battle={battle}
        simulatorSource={simulatorSource}
        resolvePersistedRoster={resolvePersistedRoster}
        frozen={frozen}
        variants={variants}
        differences={differences}
        copiedFrom={copiedFrom}
        lentBy={lentBy}
        requested={requested}
      />
    </main>
  )
}
