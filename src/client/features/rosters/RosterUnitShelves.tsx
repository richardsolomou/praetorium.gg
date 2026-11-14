import type { ComponentProps } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { AttachmentRow } from '../../../core/attachmentRows'
import { remember } from '../../../core/collections'
import { currentEntryId } from '../../../core/retiredCatalogueIds'
import { hasWarlordToggle } from '../../../core/unitChoices'
import { joinedUnits } from '../../../core/unitLoadouts'
import { AttachedUnitBlock } from './builder/AttachedUnitBlock'
import { cardEmbark, type EmbarkCard, embarkRows, NO_EMBARK } from './builder/embarkModel'
import { Section } from './builder/Section'
import { frozenAttaches, rosterShelves, type ShelfArrangement, unitRoleRows } from './builder/shelves'
import { type AttachChoice, UnitCard } from './builder/UnitCard'
import { canAddCopy, type LimitUnlocks, unitLimitMessage } from './builder/usePicks'
import type { FrozenRoster } from './ListBuilder'
import { RosterUnits } from './RosterPresentation'
import { RosterReadiness } from './RosterReadiness'
import { type AttachDirection, AttachedUnitActions, BuilderUnitCard, type useCardRelationships } from './RosterUnitCard'
import type { KeyedPick } from './rosterPicks'
import type { useRosterPrice } from './useRosterPrice'

const NO_JOINED: { label: string; name: string }[] = []
const NO_CHOICES: AttachChoice[] = []
const NO_ROWS: AttachmentRow[] = []
/** Kept per relationships' rows, so a card whose relationships are unchanged gets the same rows and does not redraw. */
const ROLE_ROWS = new WeakMap<readonly AttachmentRow[], AttachmentRow[]>()
const roleRowsOf = (joined: readonly AttachmentRow[]) => remember(ROLE_ROWS, joined, () => unitRoleRows(joined))

/** A card for each unit on the list: the fielded ones of a frozen list, or the priced ones of a list being built. */
export const rosterCards = (
  frozen: FrozenRoster | undefined,
  units: ReturnType<typeof useRosterPrice>['units'],
  picks: readonly KeyedPick[],
) =>
  frozen
    ? frozen.units.map((unit, index) => ({
        index,
        key: unit.key,
        attachedTo: unit.attachedTo,
        attaches: frozenAttaches(unit.joined),
        name: unit.name,
        group: unit.group ?? ('other' as const),
        warlord: unit.warlord,
        joined: unit.joined ?? [],
        unit: {
          entryId: unit.entryId ?? unit.key,
          name: unit.name,
          points: unit.points,
          modelCount: unit.models,
          wargear: unit.wargear ?? [],
          attachment: null,
          enhancements: unit.enhancements ?? [],
          upgrades: unit.upgrades ?? [],
        },
      }))
    : units.map((unit, index) => ({
        index,
        key: picks[index]?.key ?? index,
        attachedTo: picks[index]?.attachedTo,
        attaches: unit.attachment?.kind,
        name: unit.name,
        group: unit.group,
        warlord: hasWarlordToggle(unit.toggles),
        joined: NO_JOINED,
        unit,
      }))

type RosterCard = ReturnType<typeof rosterCards>[number]

/**
 * The roster's units, shelved by role with attached units drawn together, or what
 * stands in for them while the list loads or before it holds any.
 */
export function RosterUnitShelves({
  cards,
  arrangement,
  frozen,
  frozenEmbarks,
  picks,
  units,
  catalogueId,
  factions,
  relationships,
  selected,
  loadoutAvailable,
  editable,
  building,
  loading,
  showReadiness,
  reminderCounts,
  pricePending,
  held,
  unitLimits,
  limitUnlocks,
  onSelect,
  onRemove,
  onDuplicate,
  onSaveLoadout,
  onSaveAttachedUnit,
  onDetach,
  onReport,
  onAttach,
  onEmbark,
  onChooseUnit,
}: {
  cards: RosterCard[]
  arrangement: ShelfArrangement
  frozen?: FrozenRoster
  frozenEmbarks: ReadonlyMap<number, EmbarkCard> | null
  picks: readonly KeyedPick[]
  units: ReturnType<typeof useRosterPrice>['units']
  catalogueId: string
  factions?: readonly (NonNullable<ComponentProps<typeof BuilderUnitCard>['alliedFaction']> & { id: string })[]
  relationships: ReturnType<typeof useCardRelationships>
  selected: number | null
  loadoutAvailable: boolean
  editable: boolean
  building: boolean
  loading: boolean
  showReadiness: boolean
  reminderCounts: ReadonlyMap<number, number>
  pricePending: boolean
  held: Readonly<Record<string, number>>
  unitLimits: ReadonlyMap<string, number | null>
  limitUnlocks: LimitUnlocks
  onSelect: (index: number) => void
  onRemove: (index: number) => void
  onDuplicate: (index: number) => void
  onSaveLoadout?: (index: number) => void
  onSaveAttachedUnit?: (index: number) => void
  onDetach: (index: number) => void
  onReport: (index: number) => void
  onAttach: (index: number, direction: AttachDirection, choice: AttachChoice) => void
  onEmbark: (passengerKey: number, transportKey: number | undefined) => void
  onChooseUnit: () => void
}) {
  const shelves = rosterShelves<RosterCard>(cards, arrangement)
  const renderCard = ({ unit, index, joined, warlord }: RosterCard, inUnit = false) => {
    if (frozen)
      return (
        <UnitCard
          key={unit.entryId + index}
          unit={unit}
          warlord={warlord}
          nickname={frozen.units[index]?.nickname}
          note={frozen.units[index]?.note}
          joined={[
            ...(arrangement === 'attached' ? unitRoleRows(joined) : joined),
            ...embarkRows(cardEmbark(frozenEmbarks?.get(index) ?? NO_EMBARK, inUnit)),
          ]}
          selected={selected === index}
          onSelect={loadoutAvailable ? () => onSelect(index) : undefined}
          editable={false}
        />
      )
    const cardRelationships = relationships.get(picks[index]?.key ?? -1)
    return (
      <BuilderUnitCard
        key={picks[index]?.key ?? unit.entryId}
        unit={unit}
        warlord={warlord}
        nickname={picks[index]?.nickname}
        note={picks[index]?.note}
        index={index}
        joined={
          cardRelationships ? (arrangement === 'attached' ? roleRowsOf(cardRelationships.joined) : cardRelationships.joined) : NO_ROWS
        }
        canJoin={cardRelationships?.canJoin ?? NO_CHOICES}
        canHost={cardRelationships?.canHost ?? NO_CHOICES}
        embark={cardRelationships?.embark ?? NO_EMBARK}
        inAttachedUnit={inUnit}
        alliedFaction={
          picks[index]?.catalogueId === catalogueId ? undefined : factions?.find((entry) => entry.id === picks[index]?.catalogueId)
        }
        selected={selected === index}
        alertCount={editable ? reminderCounts.get(index) : undefined}
        onSelect={onSelect}
        onRemove={onRemove}
        onDuplicate={onDuplicate}
        canDuplicate={!pricePending && canAddCopy(unit.entryId, held[unit.entryId] ?? 0, unitLimits)}
        duplicateLimit={unitLimitMessage(unit.entryId, held[unit.entryId] ?? 0, unitLimits, limitUnlocks)}
        onSaveLoadout={onSaveLoadout}
        onSaveAttachedUnit={
          onSaveAttachedUnit && joinedUnits(picks, picks[index]?.key ?? -1, catalogueId).length ? onSaveAttachedUnit : undefined
        }
        onDetach={onDetach}
        onReport={onReport}
        onAttach={onAttach}
        onEmbark={onEmbark}
        editable={building}
      />
    )
  }

  return (
    <RosterUnits onboarding="roster-list">
      {cards.length ? (
        <>
          {shelves.map(({ id, plural, count, entries }) => (
            <Section
              key={id}
              title={plural}
              count={count}
              points={entries.flat().reduce((total, card) => total + card.unit.points, 0)}
              runner
            >
              {entries.map((members) => {
                const host = members[0]!
                return members.length > 1 ? (
                  <AttachedUnitBlock
                    key={host.key}
                    current={members.some((member) => member.index === selected)}
                    name={host.name}
                    nickname={(frozen ? frozen.units[host.index] : picks[host.index])?.nickname}
                    bodyguard={renderCard(host, true)}
                    actions={
                      frozen ? (
                        <AttachedUnitActions
                          host={host.index}
                          name={host.name}
                          embark={frozenEmbarks?.get(host.index) ?? NO_EMBARK}
                          canHost={[]}
                          editable={false}
                        />
                      ) : (
                        <AttachedUnitActions
                          host={host.index}
                          name={host.name}
                          embark={relationships.get(picks[host.index]?.key ?? -1)?.embark ?? NO_EMBARK}
                          canHost={relationships.get(picks[host.index]?.key ?? -1)?.canHost ?? NO_CHOICES}
                          editable={building}
                          onAttach={onAttach}
                          onEmbark={onEmbark}
                        />
                      )
                    }
                  >
                    {members.slice(1).map((member) => renderCard(member, true))}
                  </AttachedUnitBlock>
                ) : (
                  renderCard(host)
                )
              })}
            </Section>
          ))}
        </>
      ) : loading ? (
        <output className="block py-3" aria-label="Loading roster units">
          <span className="sr-only">Loading roster units…</span>
          <Skeleton className="mb-3 h-4 w-28" />
          <span className="grid gap-2">
            {picks.map((pick) => (
              <Skeleton key={pick.key} className="h-24" />
            ))}
          </span>
        </output>
      ) : building ? (
        <div className="space-y-3 py-6">
          <h2 className="text-xl">Add your first unit</h2>
          <p className="max-w-sm text-sm text-dim">
            Search for a unit you own or want to field. Then choose its model count and equipment in Loadout.
          </p>
          <Button variant="outline" className="roster-wide:hidden" onClick={onChooseUnit}>
            Choose a unit
          </Button>
        </div>
      ) : (
        <p className="py-6 text-sm text-faint">This roster has no units.</p>
      )}
      {showReadiness && units.length ? (
        <RosterReadiness
          units={units.map((unit) => ({
            entryId: currentEntryId(unit.entryId, catalogueId),
            name: unit.name,
            models: unit.size.models,
          }))}
        />
      ) : null}
    </RosterUnits>
  )
}
