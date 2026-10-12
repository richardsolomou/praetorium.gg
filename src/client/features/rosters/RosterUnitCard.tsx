import { memo, type ComponentProps, useLayoutEffect, useMemo, useRef } from 'react'
import type { PickerUnit } from '../../../contracts/catalogue'
import { newHosts, newJoiners, rosterJoiners } from '../../../core/attachmentOptions'
import type { KeyedPick } from './rosterPicks'
import { attachmentRows, joinableUnits } from './builder/attachments'
import { type AttachChoice, UnitCard } from './builder/UnitCard'
import { unitLimitMessage } from './builder/usePicks'

export type AttachDirection = 'join' | 'host'

type BuilderUnitCardProps = {
  unit: ComponentProps<typeof UnitCard>['unit']
  note?: string
  index: number
  joined: ReturnType<typeof attachmentRows>
  canJoin: AttachChoice[]
  canHost: AttachChoice[]
  alliedFaction: ComponentProps<typeof UnitCard>['alliedFaction']
  selected: boolean
  owned: boolean
  editable: boolean
  alertCount?: number
  onSelect: (index: number) => void
  onRemove: (index: number) => void
  onDuplicate: (index: number) => void
  canDuplicate?: boolean
  /** Absent for a visitor, whose collection has no account to live in. */
  onOwned?: (entryId: string, owned: boolean) => void
  onDetach: (index: number) => void
  onAttach: (index: number, direction: AttachDirection, choice: AttachChoice) => void
}

export const BuilderUnitCard = memo(function BuilderUnitCard({
  unit,
  note,
  index,
  joined,
  canJoin,
  canHost,
  alliedFaction,
  selected,
  owned,
  editable,
  alertCount,
  onSelect,
  onRemove,
  onDuplicate,
  canDuplicate,
  onOwned,
  onDetach,
  onAttach,
}: BuilderUnitCardProps) {
  return (
    <UnitCard
      unit={unit}
      note={note}
      alliedFaction={alliedFaction}
      selected={selected}
      onSelect={() => onSelect(index)}
      onRemove={() => onRemove(index)}
      onDuplicate={() => onDuplicate(index)}
      canDuplicate={canDuplicate}
      owned={owned}
      onOwned={onOwned ? () => onOwned(unit.entryId, !owned) : undefined}
      joined={joined.map((row) => ({ ...row, onAct: () => onDetach(row.detach) }))}
      canJoin={canJoin}
      onJoin={(choice) => onAttach(index, 'join', choice)}
      canHost={canHost}
      onHost={(choice) => onAttach(index, 'host', choice)}
      alertCount={alertCount}
      editable={editable}
    />
  )
})

type CardRelationships = {
  joined: ReturnType<typeof attachmentRows>
  canJoin: AttachChoice[]
  canHost: AttachChoice[]
}

/** The book's datasheets and the roster's copy limits, which decide whether a new unit can be added to attach. */
export type AttachDiscovery = {
  candidates: readonly PickerUnit[]
  held: Readonly<Record<string, number>>
  limits: ReadonlyMap<string, number | null>
}

export function useCardRelationships(
  picks: readonly KeyedPick[],
  units: Parameters<typeof attachmentRows>[1],
  discovery: AttachDiscovery | null,
) {
  const previous = useRef(new Map<number, CardRelationships>())
  const relationships = useMemo(() => {
    const next = new Map<number, CardRelationships>()
    const candidates = discovery?.candidates ?? []
    const added = (options: (PickerUnit & { reason: string | null })[]): AttachChoice[] =>
      options
        .map((option) => ({
          kind: 'new' as const,
          entryId: option.id,
          name: option.name,
          points: option.points,
          reason: (discovery && unitLimitMessage(option.id, discovery.held[option.id] ?? 0, discovery.limits)) ?? option.reason,
        }))
        .toSorted((left, right) => Number(Boolean(left.reason)) - Number(Boolean(right.reason)) || left.name.localeCompare(right.name))
    for (const [index, pick] of picks.entries()) {
      const candidate = {
        joined: attachmentRows(picks, units, index),
        canJoin: [
          ...joinableUnits(picks, units, index).map((host) => ({ kind: 'roster' as const, ...host })),
          ...added(newHosts(candidates, picks, units, index)),
        ],
        canHost: [
          ...rosterJoiners(picks, units, index).map((joiner) => ({ kind: 'roster' as const, ...joiner })),
          ...added(newJoiners(candidates, picks, units, index)),
        ],
      }
      const current = previous.current.get(pick.key)
      next.set(pick.key, current && sameRelationships(current, candidate) ? current : candidate)
    }
    return next
  }, [picks, units, discovery])
  useLayoutEffect(() => {
    previous.current = relationships
  }, [relationships])
  return relationships
}

function sameRelationships(left: CardRelationships, right: CardRelationships) {
  return JSON.stringify(left) === JSON.stringify(right)
}
