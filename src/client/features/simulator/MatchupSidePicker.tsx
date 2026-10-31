import { useQuery } from '@tanstack/react-query'
import { useState, type ComponentProps } from 'react'
import { ChevronDown, ChevronLeft, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ControlTooltip } from '../../components/ControlTooltip'
import { FactionMark } from '../../components/FactionMark'
import { SearchableSelect } from '../../components/SearchableSelect'
import { UnitPicker } from '../../components/UnitPicker'
import { factionFor } from '../../factions'
import { factionIndexQuery } from '../../queries'
import { type RosterGroup, useRosterGroups } from './RosterPicker'
import { LevelLink, RosterUnits } from './SideUnitPicker'
import type { CombatRoster } from './useCombatant'

/** A side fielding one unit: a datasheet, or one unit of a roster with that roster's detachments and gear. */
export type UnitChoice =
  | { kind: 'datasheet'; catalogueId: string; entryId: string; name: string }
  | { kind: 'roster'; key: string; pickIndex: number; name: string }

/** The single unit before one is chosen. */
export const SINGLE_UNIT = 'unit'
const UNIT_PREFIX = 'unit:'
export const unitChoiceId = (choice: UnitChoice) => UNIT_PREFIX + JSON.stringify(choice)
export const parseUnitChoice = (id: string): UnitChoice | null =>
  id.startsWith(UNIT_PREFIX) ? (JSON.parse(id.slice(UNIT_PREFIX.length)) as UnitChoice) : null

/** What a side can field one unit from: every datasheet and the rosters this player can open. */
export type UnitSources = {
  catalogue: ComponentProps<typeof UnitPicker>['index']
  loadRoster: (key: string) => Promise<CombatRoster | null>
}

type Level = { kind: 'list' } | { kind: 'datasheets' } | { kind: 'roster'; key: string }

/**
 * One side of a matchup: a single choice such as a unit or benchmark targets, or any number of rosters fought together.
 *
 * A single choice shows as a select; once a side holds rosters each is listed with a way to remove it and to add another.
 * With `units`, choosing "Single unit" lists every datasheet and choosing a roster lists its units, each a level down in
 * the same list, and each listed roster opens its units too, so a side can field one unit as readily as a whole roster.
 */
export function MatchupSidePicker({
  ariaLabel,
  groups,
  value,
  single,
  loading,
  units,
  unitId,
  onAdd,
  onRemove,
}: {
  ariaLabel: string
  groups: readonly RosterGroup[]
  value: readonly string[]
  /** Choices that fill a side alone rather than joining its rosters. */
  single: (id: string) => boolean
  loading?: boolean
  units?: UnitSources
  /** The choice that opens the datasheet level. */
  unitId: string
  onAdd: (id: string) => void
  onRemove: (id: string) => void
}) {
  const items = useRosterGroups(groups)
  const factions = useQuery(factionIndexQuery())
  const [level, setLevel] = useState<Level | null>(null)
  const factionIcon = (catalogueId: string | undefined) => {
    const faction = catalogueId ? factionFor(factions.data, catalogueId) : undefined
    return faction ? <FactionMark faction={faction} size="sm" /> : undefined
  }
  const labelOf = (id: string) =>
    parseUnitChoice(id)?.name ?? items.flatMap((group) => group.items).find((item) => item.value === id)?.label ?? 'Roster'
  const rosterUnit = (key: string) => (pickIndex: number, name: string) =>
    onAdd(unitChoiceId({ kind: 'roster', key, pickIndex, name: `${name} · ${labelOf(key)}` }))
  if (value.length < 2 && !value.some((id) => !single(id))) {
    const shown = level ?? { kind: 'list' }
    const shared = {
      key: JSON.stringify(shown),
      ariaLabel,
      loading,
      defaultOpen: level !== null,
      placeholder: value[0] ? labelOf(value[0]) : 'Choose units or rosters',
      onOpenChange: (open: boolean, reason: string) => {
        if (!open && reason !== 'item-press') setLevel(null)
      },
    }
    const choose = (id: string) => {
      setLevel(null)
      onAdd(id)
    }
    const back = (
      <LevelLink onClick={() => setLevel({ kind: 'list' })}>
        <ChevronLeft className="size-4 text-info" aria-hidden />
        Units and rosters
      </LevelLink>
    )
    const current = parseUnitChoice(value[0] ?? '')
    if (shown.kind === 'datasheets' && units)
      return (
        <UnitPicker
          {...shared}
          searchPlaceholder="Search units…"
          index={units.catalogue}
          selected={current?.kind === 'datasheet' ? current : undefined}
          header={back}
          onUnitChange={(catalogueId, entryId) =>
            choose(
              unitChoiceId({
                kind: 'datasheet',
                catalogueId,
                entryId,
                name:
                  units.catalogue.find((book) => book.catalogueId === catalogueId)?.units.find((unit) => unit.id === entryId)?.name ?? '',
              }),
            )
          }
        />
      )
    if (shown.kind === 'roster' && units)
      return (
        <RosterUnits
          {...shared}
          rosterKey={shown.key}
          combatant={null}
          load={units.loadRoster}
          factionIcon={factionIcon}
          header={back}
          onWhole={() => choose(shown.key)}
          onChoose={(pickIndex, name) => {
            setLevel(null)
            rosterUnit(shown.key)(pickIndex, name)
          }}
        />
      )
    return (
      <SearchableSelect
        {...shared}
        groups={items}
        value={value[0] ?? ''}
        onValueChange={(id) => {
          if (units && id === unitId) setLevel({ kind: 'datasheets' })
          else if (units && !single(id)) setLevel({ kind: 'roster', key: id })
          else choose(id)
        }}
      />
    )
  }
  const chosen = items.flatMap((group) => group.items).filter((item) => value.includes(item.value))
  return (
    <div className="min-w-0 space-y-1">
      {chosen.map((item) => {
        const label = (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            {item.icon}
            <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
          </span>
        )
        return (
          <div key={item.value} className="flex min-w-0 items-center gap-1">
            {units ? (
              <RosterUnits
                ariaLabel={`${item.label} units`}
                placeholder={item.label}
                rosterKey={item.value}
                combatant={null}
                load={units.loadRoster}
                factionIcon={factionIcon}
                align="start"
                trigger={
                  <>
                    {label}
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </>
                }
                onWhole={() => undefined}
                onChoose={rosterUnit(item.value)}
              />
            ) : (
              <div className="flex h-8 min-w-0 flex-1 items-center rounded-lg border border-input px-2.5 text-sm">{label}</div>
            )}
            <ControlTooltip label={`Remove ${item.label}`}>
              <Button variant="ghost" size="icon-sm" aria-label={`Remove ${item.label}`} onClick={() => onRemove(item.value)}>
                <X aria-hidden />
              </Button>
            </ControlTooltip>
          </div>
        )
      })}
      <SearchableSelect
        ariaLabel={`${ariaLabel}: add roster`}
        placeholder="Add roster"
        searchPlaceholder="Search rosters…"
        value=""
        groups={items.map((group) => ({
          ...group,
          items: group.items.filter((item) => !value.includes(item.value) && !single(item.value)),
        }))}
        onValueChange={onAdd}
        align="start"
        trigger={
          <span className="flex items-center gap-1.5">
            <Plus className="size-4" aria-hidden /> Add roster
          </span>
        }
        className="h-8 w-auto border-dashed px-2.5 text-dim"
      />
    </div>
  )
}
