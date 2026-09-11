import { memo, type ComponentProps, useLayoutEffect, useMemo, useRef } from 'react'
import type { KeyedPick } from '../../rosterPicks'
import { attachmentRows, joinableUnits } from '../builder/attachments'
import { UnitCard } from '../builder/UnitCard'

type BuilderUnitCardProps = {
  unit: ComponentProps<typeof UnitCard>['unit']
  index: number
  joined: ReturnType<typeof attachmentRows>
  canJoin: ReturnType<typeof joinableUnits>
  alliedFaction: ComponentProps<typeof UnitCard>['alliedFaction']
  selected: boolean
  owned: boolean
  editable: boolean
  onSelect: (index: number) => void
  onRemove: (index: number) => void
  onDuplicate: (index: number) => void
  onOwned: (entryId: string, owned: boolean) => void
  onJoin: (index: number, targetKey: number | undefined) => void
}

export const BuilderUnitCard = memo(function BuilderUnitCard({
  unit,
  index,
  joined,
  canJoin,
  alliedFaction,
  selected,
  owned,
  editable,
  onSelect,
  onRemove,
  onDuplicate,
  onOwned,
  onJoin,
}: BuilderUnitCardProps) {
  return (
    <UnitCard
      unit={unit}
      alliedFaction={alliedFaction}
      selected={selected}
      onSelect={() => onSelect(index)}
      onRemove={() => onRemove(index)}
      onDuplicate={() => onDuplicate(index)}
      owned={owned}
      onOwned={() => onOwned(unit.entryId, !owned)}
      joined={joined.map((row) => ({ ...row, onAct: () => onJoin(row.detach, undefined) }))}
      canJoin={canJoin}
      onJoin={(targetKey) => onJoin(index, targetKey)}
      editable={editable}
    />
  )
})

type CardRelationships = {
  joined: ReturnType<typeof attachmentRows>
  canJoin: ReturnType<typeof joinableUnits>
}

export function useCardRelationships(picks: readonly KeyedPick[], units: Parameters<typeof attachmentRows>[1]) {
  const previous = useRef(new Map<number, CardRelationships>())
  const relationships = useMemo(() => {
    const next = new Map<number, CardRelationships>()
    for (const [index, pick] of picks.entries()) {
      const candidate = { joined: attachmentRows(picks, units, index), canJoin: joinableUnits(picks, units, index) }
      const current = previous.current.get(pick.key)
      next.set(pick.key, current && sameRelationships(current, candidate) ? current : candidate)
    }
    return next
  }, [picks, units])
  useLayoutEffect(() => {
    previous.current = relationships
  }, [relationships])
  return relationships
}

function sameRelationships(left: CardRelationships, right: CardRelationships) {
  return (
    left.joined.length === right.joined.length &&
    left.joined.every((row, index) => {
      const other = right.joined[index]
      return Boolean(
        other && row.label === other.label && row.name === other.name && row.action === other.action && row.detach === other.detach,
      )
    }) &&
    left.canJoin.length === right.canJoin.length &&
    left.canJoin.every((unit, index) => unit.key === right.canJoin[index]?.key && unit.name === right.canJoin[index]?.name)
  )
}
