import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { ChevronLeft, ScrollText } from 'lucide-react'
import { SearchableSelect } from '../../components/SearchableSelect'
import { UnitPicker } from '../../components/UnitPicker'
import { priceQuery } from '../../queries'
import type { SimulatorSide } from '../../../contracts/simulatorState'
import { PICKER_POPUP } from './CombatControls'
import { RosterPicker } from './RosterPicker'
import type { RosterOwner } from './rosterOwners'
import type { Combatant, CombatRoster } from './useCombatant'
import { countLabel } from '../../text'

type RosterGroup = { label: string; options: readonly { id: string; label: string; catalogueId?: string }[] }

/** What the standalone simulator lets a side do with the rosters its player can open. */
export type RosterNavigation = {
  groups: readonly RosterGroup[]
  /** The roster this side fields, by its source key. */
  current: string | null
  owner?: RosterOwner
  load: (key: string) => Promise<CombatRoster | null>
  chooseRosterUnit: (key: string, pickIndex: number) => void
  /** Fields this side as given, leaving any roster behind. */
  replace: (side: SimulatorSide) => void
}

type Level = { kind: 'units' } | { kind: 'rosters' } | { kind: 'roster'; key: string }

/**
 * A side's unit, chosen from every datasheet or, a level down, from one of the player's rosters.
 * Each level is its own list, opened in place of the last, so search starts afresh on every level.
 */
export function SideUnitPicker({
  side,
  combatant,
  rosters,
  catalogue,
  factionIcon,
  loading,
}: {
  side: string
  combatant: Combatant
  rosters?: RosterNavigation
  catalogue: Pick<Parameters<typeof UnitPicker>[0], 'index' | 'emptyText' | 'extraBooks' | 'selected'>
  factionIcon: (catalogueId: string | undefined) => ReactNode
  loading: boolean
}) {
  const home: Level = combatant.roster ? { kind: 'roster', key: rosters?.current ?? '' } : { kind: 'units' }
  const [level, setLevel] = useState<Level | null>(null)
  const [opened, setOpened] = useState(false)
  const shown = level ?? home
  const go = (next: Level) => {
    setLevel(next)
    setOpened(true)
  }
  const settle = () => {
    setLevel(null)
    setOpened(false)
  }
  const rosterCount = rosters?.groups.reduce((total, group) => total + group.options.length, 0) ?? 0
  const levelKey = JSON.stringify(shown)
  const shared = {
    ariaLabel: `${side} unit`,
    popupClassName: PICKER_POPUP,
    loading,
    defaultOpen: opened,
    placeholder: combatant.unit?.name ?? 'Choose a unit',
    onOpenChange: (open: boolean, reason: string) => {
      if (!open && reason !== 'item-press') settle()
    },
  }

  if (shown.kind === 'units')
    return (
      <UnitPicker
        key={levelKey}
        {...shared}
        searchPlaceholder="Search units…"
        {...catalogue}
        header={
          rosterCount ? (
            <LevelLink onClick={() => go({ kind: 'rosters' })} detail={countLabel(rosterCount, 'roster')}>
              <ScrollText className="size-4 text-info" aria-hidden />
              From a roster
            </LevelLink>
          ) : undefined
        }
        onUnitChange={(catalogueId, entryId) => {
          settle()
          if (combatant.roster) rosters?.replace({ catalogueId, pick: { entryId, catalogueId }, rules: {} })
          else combatant.selectUnit(catalogueId, entryId)
        }}
      />
    )

  if (shown.kind === 'rosters' && rosters)
    return (
      <RosterPicker
        key={levelKey}
        {...shared}
        searchPlaceholder="Search rosters…"
        value={rosters.current ?? ''}
        header={
          <LevelLink onClick={() => go({ kind: 'units' })}>
            <ChevronLeft className="size-4 text-info" aria-hidden />
            All units
          </LevelLink>
        }
        groups={rosters.groups}
        onValueChange={(key) => go({ kind: 'roster', key })}
      />
    )

  const current = shown.kind === 'roster' && shown.key === rosters?.current
  return (
    <RosterUnits
      key={levelKey}
      {...shared}
      rosterKey={shown.kind === 'roster' ? shown.key : ''}
      combatant={current || !rosters ? combatant : null}
      load={rosters?.load}
      factionIcon={factionIcon}
      header={
        rosters ? (
          <LevelLink onClick={() => go({ kind: 'rosters' })}>
            <ChevronLeft className="size-4 text-info" aria-hidden />
            Rosters
          </LevelLink>
        ) : undefined
      }
      onChoose={(index) => {
        settle()
        if (current || !rosters) combatant.selectRosterUnit(index)
        else if (shown.kind === 'roster') rosters.chooseRosterUnit(shown.key, index)
      }}
    />
  )
}

/** One roster's units: this side's own from its loaded state, another's once it is opened and priced. */
function RosterUnits({
  rosterKey,
  combatant,
  load,
  factionIcon,
  onChoose,
  ...props
}: Omit<Parameters<typeof SearchableSelect>[0], 'groups' | 'value' | 'onValueChange'> & {
  rosterKey: string
  combatant: Combatant | null
  load?: (key: string) => Promise<CombatRoster | null>
  factionIcon: (catalogueId: string | undefined) => ReactNode
  onChoose: (index: number) => void
}) {
  const opened = useQuery({
    queryKey: ['simulator-roster', rosterKey],
    queryFn: () => load!(rosterKey),
    enabled: !combatant && Boolean(load),
  })
  const roster = opened.data
  const priced = useQuery({
    ...priceQuery(
      roster?.catalogueId ?? '',
      roster?.detachmentIds ?? [],
      roster?.disposition ?? null,
      roster?.limit ?? 2000,
      roster?.picks ?? [],
      roster?.waivedRules,
      roster?.borrowedDetachmentId,
      roster?.optionalRules,
    ),
    enabled: Boolean(roster?.picks.length),
  })
  const units = combatant ? (combatant.price.data?.units ?? []) : (priced.data?.units ?? [])
  const picks = combatant ? combatant.picks.positioned : (roster?.picks ?? [])
  const catalogueId = combatant ? combatant.catalogueId : roster?.catalogueId
  const items = units.flatMap((entry, index) =>
    combatant?.availableUnits && !combatant.availableUnits[index]
      ? []
      : [
          {
            value: String(index),
            icon: factionIcon(picks[index]?.catalogueId ?? catalogueId),
            label: `${entry.name}${units.filter((candidate) => candidate.entryId === entry.entryId).length > 1 ? ` · ${index + 1}` : ''}`,
          },
        ],
  )
  const waiting = !combatant && (opened.isPending || priced.isPending)
  return (
    <SearchableSelect
      {...props}
      searchPlaceholder="Search this roster…"
      emptyText={waiting ? 'Loading roster…' : opened.data === null ? 'This roster could not be opened.' : 'No units match.'}
      value={combatant ? String(combatant.pickIndex) : ''}
      onValueChange={(value) => onChoose(Number(value))}
      groups={[{ label: 'Roster units', items }]}
    />
  )
}

/** A row above a level's list that opens another level in its place. */
function LevelLink({ onClick, detail, children }: { onClick: () => void; detail?: string; children: ReactNode }) {
  return (
    <div className="border-b border-edge p-1">
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm outline-none hover:bg-edge focus-visible:bg-edge"
      >
        {children}
        {detail ? <span className="ml-auto shrink-0 pl-3 text-xs text-dim">{detail}</span> : null}
      </button>
    </div>
  )
}
