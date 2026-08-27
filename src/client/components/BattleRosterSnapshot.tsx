import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { Roster } from '../../core/battle'
import { factionQuery, priceQuery } from '../queries'
import { RosterEditor } from './RosterEditor'
import { RosterBody, RosterHeader, RosterShell, RosterUnits } from './RosterPresentation'
import { DatasheetPanel } from './builder/DatasheetPanel'
import { GROUPS } from './builder/groups'
import { Loadout } from './builder/Loadout'
import { Pane } from './builder/Pane'
import { Section } from './builder/Section'
import { UnitCard } from './builder/UnitCard'

export function BattleRosterSnapshot({ roster }: { roster: Roster }) {
  const built = roster.built
  const frozen = !roster.id
  const [selected, setSelected] = useState<number | null>(null)
  const { data: faction } = useQuery({ ...factionQuery(built?.catalogueId ?? ''), enabled: Boolean(built) })
  const { data: priced } = useQuery({
    ...priceQuery(built?.catalogueId ?? '', built?.detachmentIds ?? [], built?.disposition ?? null, built?.limit ?? 0, built?.picks ?? []),
    enabled: Boolean(built?.picks && built.detachmentIds && (!frozen || selected !== null)),
  })
  const hasRosterCards = built?.units.some((unit) => unit.group !== undefined) ?? false
  const frozenPoints = frozen && built ? built.units.reduce((total, unit) => total + unit.points, 0) : null
  const selectedUnit = selected === null ? null : (built?.units[selected] ?? null)
  const selectedPricedUnit = selected === null ? null : (priced?.units[selected] ?? null)
  const selectedCatalogueId = selected === null ? built?.catalogueId : (built?.picks?.[selected]?.catalogueId ?? built?.catalogueId)
  const displayedDetachments = (built?.detachments ?? (built?.detachment ? [{ name: built.detachment, points: null }] : [])).map(
    (detachment, index) => ({ ...detachment, id: built?.detachmentIds?.[index] }),
  )

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
      <RosterShell>
        <RosterHeader
          name={roster.name}
          faction={faction}
          points={frozenPoints}
          limit={built?.limit}
          detachments={displayedDetachments}
          disposition={built?.disposition}
        />
        <RosterBody>
          <RosterUnits>
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
          </RosterUnits>
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
        </RosterBody>
      </RosterShell>
    </main>
  )
}
