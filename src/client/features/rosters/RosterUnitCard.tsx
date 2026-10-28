import { memo, type ComponentProps, useMemo, useState } from 'react'
import type { PickerUnit } from '../../../contracts/catalogue'
import { availableChoices, joinableUnits, newHosts, newJoiners, occupantsByHost, rosterJoiners } from '../../../core/attachmentOptions'
import { attachmentRows } from '../../../core/attachmentRows'
import type { KeyedPick } from './rosterPicks'
import { AttachMenu, type AttachChoice, EmbarkMenu, JoinedRow, UnitCard } from './builder/UnitCard'
import { cardEmbark, type EmbarkCard, embarkRows, NO_EMBARK } from './builder/embarkModel'
import { unitLimitMessage } from './builder/usePicks'

export type AttachDirection = 'join' | 'host'

type BuilderUnitCardProps = {
  unit: ComponentProps<typeof UnitCard>['unit']
  warlord?: boolean
  nickname?: string
  note?: string
  index: number
  joined: ReturnType<typeof attachmentRows>
  canJoin: AttachChoice[]
  canHost: AttachChoice[]
  embark: EmbarkCard
  /** Drawn in an attached unit, which offers the unit's own joiners and embark instead. */
  inAttachedUnit: boolean
  alliedFaction: ComponentProps<typeof UnitCard>['alliedFaction']
  selected: boolean
  editable: boolean
  alertCount?: number
  onSelect: (index: number) => void
  onRemove: (index: number) => void
  onDuplicate: (index: number) => void
  canDuplicate?: boolean
  onSaveLoadout?: (index: number) => void
  onSaveAttachedUnit?: (index: number) => void
  onDetach: (index: number) => void
  onAttach: (index: number, direction: AttachDirection, choice: AttachChoice) => void
  /** Starts the unit picked under `passengerKey` in the transport picked under `transportKey`, or on the battlefield. */
  onEmbark: (passengerKey: number, transportKey: number | undefined) => void
}

export const BuilderUnitCard = memo(function BuilderUnitCard({
  unit,
  warlord,
  nickname,
  note,
  index,
  joined,
  canJoin,
  canHost,
  embark: unitEmbark,
  inAttachedUnit,
  alliedFaction,
  selected,
  editable,
  alertCount,
  onSelect,
  onRemove,
  onDuplicate,
  canDuplicate,
  onSaveLoadout,
  onSaveAttachedUnit,
  onDetach,
  onAttach,
  onEmbark,
}: BuilderUnitCardProps) {
  const embark = cardEmbark(unitEmbark, inAttachedUnit)
  return (
    <UnitCard
      unit={unit}
      warlord={warlord}
      nickname={nickname}
      note={note}
      alliedFaction={alliedFaction}
      selected={selected}
      onSelect={() => onSelect(index)}
      onRemove={() => onRemove(index)}
      onDuplicate={() => onDuplicate(index)}
      canDuplicate={canDuplicate}
      onSaveLoadout={onSaveLoadout && (() => onSaveLoadout(index))}
      onSaveAttachedUnit={onSaveAttachedUnit && (() => onSaveAttachedUnit(index))}
      onDetach={joined.some((row) => row.detach === index) ? () => onDetach(index) : undefined}
      joined={[
        ...joined.map((row) => ({ ...row, onAct: () => onDetach(row.detach) })),
        ...embarkRows(embark).map((row) => ({ ...row, onAct: () => onEmbark(row.passenger, undefined) })),
      ]}
      canJoin={canJoin}
      onJoin={(choice) => onAttach(index, 'join', choice)}
      canHost={inAttachedUnit ? [] : canHost}
      onHost={(choice) => onAttach(index, 'host', choice)}
      canBoard={embark.canBoard}
      onBoard={(choice) => onEmbark(choice.passenger, choice.transport)}
      canCarry={embark.canCarry}
      onCarry={(choice) => onEmbark(choice.passenger, choice.transport)}
      alertCount={alertCount}
      editable={editable}
    />
  )
})

/**
 * What an attached unit does as one, drawn once below its cards rather than on each of its cards: who else may join it,
 * and where it starts embarked. `host` is the bodyguard, whose card the unit's embark is told on.
 */
export function AttachedUnitActions({
  host,
  name,
  embark,
  canHost,
  editable,
  onAttach,
  onEmbark,
}: {
  host: number
  name: string
  embark: EmbarkCard
  canHost: AttachChoice[]
  editable: boolean
  onAttach?: (index: number, direction: AttachDirection, choice: AttachChoice) => void
  onEmbark?: (passengerKey: number, transportKey: number | undefined) => void
}) {
  const { ridesIn } = embark
  return (
    <>
      {editable && canHost.length ? (
        <AttachMenu
          label="Attach unit"
          ariaLabel={`Attach a unit to ${name}`}
          choices={canHost}
          onChoose={(choice) => onAttach?.(host, 'host', choice)}
        />
      ) : null}
      {ridesIn ? (
        <JoinedRow
          row={{ ...ridesIn, label: 'Unit embarked in', onAct: () => onEmbark?.(ridesIn.passenger, undefined) }}
          editable={editable}
        />
      ) : null}
      {editable && embark.canBoard.length ? (
        <EmbarkMenu
          label="Embark unit in transport"
          ariaLabel={`Embark ${name} in transport`}
          choiceLabel={(choice) => `Embark ${name} in ${choice.name}`}
          choices={embark.canBoard}
          onChoose={(choice) => onEmbark?.(choice.passenger, choice.transport)}
        />
      ) : null}
    </>
  )
}

type CardRelationships = {
  joined: ReturnType<typeof attachmentRows>
  canJoin: AttachChoice[]
  canHost: AttachChoice[]
  embark: EmbarkCard
}

/** The book's datasheets and the roster's copy limits, which decide whether a new unit can be added to attach. */
type AttachDiscovery = {
  candidates: readonly PickerUnit[]
  held: Readonly<Record<string, number>>
  limits: ReadonlyMap<string, number | null>
}

export function useCardRelationships(
  picks: readonly KeyedPick[],
  units: Parameters<typeof attachmentRows>[1],
  discovery: AttachDiscovery | null,
  /** Each card's starting embarks, by pick key. */
  embarks: ReadonlyMap<number, EmbarkCard> | null,
) {
  const computed = useMemo(() => {
    const next = new Map<number, CardRelationships>()
    const candidates = discovery?.candidates ?? []
    const added = (options: PickerUnit[]): AttachChoice[] =>
      options
        .map((option) => ({
          kind: 'new' as const,
          entryId: option.id,
          name: option.name,
          points: option.points,
          reason: discovery && unitLimitMessage(option.id, discovery.held[option.id] ?? 0, discovery.limits),
        }))
        .toSorted((left, right) => Number(Boolean(left.reason)) - Number(Boolean(right.reason)) || left.name.localeCompare(right.name))
    const occupants = occupantsByHost(picks, units)
    for (const [index, pick] of picks.entries()) {
      const candidate = {
        joined: attachmentRows(picks, units, index),
        canJoin: availableChoices([
          ...joinableUnits(picks, units, index, occupants).map((host) => ({ kind: 'roster' as const, ...host })),
          ...added(newHosts(candidates, picks, units, index)),
        ]),
        canHost: availableChoices([
          ...rosterJoiners(picks, units, index, occupants).map((joiner) => ({ kind: 'roster' as const, ...joiner })),
          ...added(newJoiners(candidates, picks, units, index, occupants)),
        ]),
        embark: embarks?.get(pick.key) ?? NO_EMBARK,
      }
      next.set(pick.key, candidate)
    }
    return next
  }, [picks, units, discovery, embarks])
  // A card whose relationships read the same keeps the same object, so it does not redraw; this is React's pattern for
  // keeping information from the previous render in state.
  const [kept, setKept] = useState({ from: computed, relationships: computed })
  if (kept.from !== computed) {
    const relationships = new Map<number, CardRelationships>()
    for (const [key, candidate] of computed) {
      const current = kept.relationships.get(key)
      relationships.set(key, current && sameRelationships(current, candidate) ? current : candidate)
    }
    setKept({ from: computed, relationships })
  }
  return kept.relationships
}

function sameRelationships(left: CardRelationships, right: CardRelationships) {
  return JSON.stringify(left) === JSON.stringify(right)
}
