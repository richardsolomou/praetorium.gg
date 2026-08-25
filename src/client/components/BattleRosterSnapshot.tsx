import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import type { Roster } from '../../core/battle'
import { GAME_SIZES } from '../../core/battle'
import { factionQuery, priceQuery } from '../queries'
import { FactionLabel } from './FactionMark'
import { RosterEditor } from './RosterEditor'
import { DatasheetPanel } from './builder/DatasheetPanel'
import { GROUPS } from './builder/groups'
import { Loadout } from './builder/Loadout'
import { Pane } from './builder/Pane'
import { Section } from './builder/Section'
import { UnitCard } from './builder/UnitCard'
import { dispositionTone } from './rosterSetup'

export function BattleRosterSnapshot({ roster }: { roster: Roster }) {
  const built = roster.built
  const { data: faction } = useQuery({ ...factionQuery(built?.catalogueId ?? ''), enabled: Boolean(built) })
  const { data: priced } = useQuery({
    ...priceQuery(built?.catalogueId ?? '', built?.detachmentIds ?? [], built?.disposition ?? null, built?.limit ?? 0, built?.picks ?? []),
    enabled: Boolean(built?.picks && built.detachmentIds),
  })
  const hasRosterCards = built?.units.some((unit) => unit.group !== undefined) ?? false
  const frozen = !roster.id
  const frozenPoints = frozen && built ? built.units.reduce((total, unit) => total + unit.points, 0) : null
  const [selected, setSelected] = useState<number | null>(null)
  const selectedUnit = selected === null ? null : (built?.units[selected] ?? null)
  const selectedPricedUnit = selected === null ? null : (priced?.units[selected] ?? null)
  const selectedCatalogueId = selected === null ? built?.catalogueId : (built?.picks?.[selected]?.catalogueId ?? built?.catalogueId)
  const displayedDetachments = built?.detachments ?? (built?.detachment ? [{ name: built.detachment, points: null }] : [])
  const shownDisposition = built?.disposition
    ? (faction?.detachments.flatMap((entry) => entry.dispositions).find((entry) => entry.id === built.disposition) ?? {
        id: built.disposition,
        name: built.disposition,
      })
    : null

  if (!frozen && roster.id && built?.detachmentIds && built.picks) {
    return (
      <RosterEditor
        roster={{
          id: roster.id,
          name: roster.name,
          catalogueId: built.catalogueId,
          detachmentIds: built.detachmentIds,
          disposition: built.disposition,
          limit: built.limit,
          picks: built.picks,
          visibility: 'private',
          source: 'editable',
        }}
        faction={faction}
        editable={false}
        resolvePersistedRoster={false}
      />
    )
  }

  return (
    <main className="flex h-full w-full flex-col">
      <div data-roster-builder className="flex min-h-0 flex-1 flex-col border border-edge bg-sunken">
        <header className="border-b border-edge px-3 py-2">
          <Input
            value={roster.name}
            aria-label="List name"
            readOnly
            className="h-8 border-0 bg-transparent px-0 text-lg font-bold tracking-[0.02em] uppercase focus-visible:ring-0"
          />
          {built ? (
            <div className="flex w-full min-w-0 items-center gap-2 overflow-x-auto text-xs whitespace-nowrap text-dim [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {faction ? (
                <Link
                  to="/factions/$catalogueId"
                  params={{ catalogueId: faction.slug }}
                  className="flex shrink-0 items-center self-stretch text-info hover:text-bone"
                >
                  <FactionLabel faction={faction} />
                </Link>
              ) : null}
              {faction ? <span aria-hidden>·</span> : null}
              {frozenPoints !== null ? <span className="chip text-info">{frozenPoints} pts</span> : null}
              <span className="shrink-0">{GAME_SIZES.find((size) => size.limit === built.limit)?.name ?? `${built.limit} points`}</span>
              {displayedDetachments.map((detachment, index) => {
                const id = built.detachmentIds?.[index]
                const reference = faction?.detachments.find((candidate) => candidate.id === id)
                const label = `${detachment.name}${detachment.points === null ? '' : ` · ${detachment.points} DP`}`
                return (
                  <span key={detachment.name} className="contents">
                    <span aria-hidden>·</span>
                    {faction && reference ? (
                      <Link
                        to="/factions/$catalogueId/detachments/$detachmentId"
                        params={{ catalogueId: faction.slug, detachmentId: reference.slug }}
                        className="shrink-0 text-info hover:text-bone"
                      >
                        {label}
                      </Link>
                    ) : (
                      <span className="shrink-0">{label}</span>
                    )}
                  </span>
                )
              })}
              {shownDisposition ? (
                <span className="contents">
                  <span aria-hidden>·</span>
                  <span className={`chip shrink-0 ${dispositionTone(shownDisposition.id)}`}>{shownDisposition.name}</span>
                </span>
              ) : null}
            </div>
          ) : null}
        </header>

        <div className="flex min-h-0 flex-1">
          <div data-slot="roster-units" className="min-h-0 min-w-0 flex-1 overflow-y-auto px-3">
            {hasRosterCards && built ? (
              GROUPS.map(({ id, plural }) => {
                const units = built.units
                  .map((unit, index) => ({ unit, index }))
                  .filter(({ unit }) => (unit.group ?? 'other') === id)
                  .toSorted((left, right) => left.unit.name.localeCompare(right.unit.name))
                return units.length ? (
                  <Section key={id} title={plural} count={units.length}>
                    {units.map(({ unit, index }) => (
                      <UnitCard
                        key={unit.key}
                        unit={{
                          entryId: unit.entryId ?? unit.key,
                          name: unit.name,
                          points: unit.points,
                          modelCount: frozen ? unit.models : undefined,
                          wargear: unit.wargear ?? [],
                          attachment: null,
                          enhancements: unit.enhancements ?? [],
                          upgrades: unit.upgrades ?? [],
                        }}
                        selected={selected === index}
                        onSelect={built.picks && built.detachmentIds ? () => setSelected(index) : undefined}
                        joined={unit.joined ?? []}
                        editable={false}
                      />
                    ))}
                  </Section>
                ) : null
              })
            ) : (
              <pre className="my-3 overflow-auto whitespace-pre-wrap border border-edge bg-panel p-3 font-rules text-sm select-text">
                {roster.text}
              </pre>
            )}
          </div>
          {built?.picks && built.detachmentIds ? (
            <Pane
              variant="loadout"
              open={selectedUnit !== null}
              threeColumn={false}
              title={selectedUnit?.name ?? 'Unit'}
              ariaLabel="Datasheet"
              onClose={() => setSelected(null)}
              actions={
                selectedUnit ? (
                  <span className="flex gap-1.5">
                    <span className="chip text-info">{selectedUnit.points} pts</span>
                    <span className="chip normal-case">
                      {selectedUnit.models} {selectedUnit.models === 1 ? 'model' : 'models'}
                    </span>
                  </span>
                ) : null
              }
            >
              <Loadout
                catalogueId={selectedCatalogueId ?? built.catalogueId}
                unit={selectedPricedUnit}
                detachmentIds={built.detachmentIds}
                picks={built.picks}
                pickIndex={selected}
                onChoose={() => {}}
                onSpread={() => {}}
                onSwap={() => {}}
                editable={false}
                showOptions={false}
                reference={
                  <DatasheetPanel
                    catalogueId={selectedCatalogueId ?? built.catalogueId}
                    entryId={selectedPricedUnit?.entryId ?? null}
                    detachmentIds={built.detachmentIds}
                    picks={built.picks}
                    pickIndex={selected}
                    showWeapons
                    embedded
                    hideSummary
                    showRelationships={false}
                  />
                }
              />
            </Pane>
          ) : null}
        </div>
      </div>
    </main>
  )
}
