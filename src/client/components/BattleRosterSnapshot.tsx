import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import type { Roster } from '../../core/battle'
import { GAME_SIZES } from '../../core/battle'
import { factionQuery } from '../queries'
import { FactionLabel } from './FactionMark'
import { RosterEditor } from './RosterEditor'
import { DatasheetPanel } from './builder/DatasheetPanel'
import { GROUPS } from './builder/groups'
import { Pane } from './builder/Pane'
import { Section } from './builder/Section'
import { UnitCard } from './builder/UnitCard'

export function BattleRosterSnapshot({ roster }: { roster: Roster }) {
  const built = roster.built
  const { data: faction } = useQuery({ ...factionQuery(built?.catalogueId ?? ''), enabled: Boolean(built) })
  const hasRosterCards = built?.units.some((unit) => unit.group !== undefined) ?? false
  const frozen = !roster.id
  const frozenPoints = frozen && built ? built.units.reduce((total, unit) => total + unit.points, 0) : null
  const [selected, setSelected] = useState<number | null>(null)
  const selectedUnit = selected === null ? null : (built?.units[selected] ?? null)
  const selectedCatalogueId = selected === null ? built?.catalogueId : (built?.picks?.[selected]?.catalogueId ?? built?.catalogueId)

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
            <div className="flex min-w-0 items-center gap-2 text-xs text-dim">
              {faction ? (
                <Link to="/factions/$catalogueId" params={{ catalogueId: faction.slug }} className="truncate text-info hover:text-bone">
                  <FactionLabel faction={faction} />
                </Link>
              ) : null}
              {faction ? <span aria-hidden>·</span> : null}
              {frozenPoints !== null ? <span className="chip text-info">{frozenPoints} pts</span> : null}
              <Link to="/rosters" search={{ limit: built.limit }} className="shrink-0 text-info hover:text-bone">
                {GAME_SIZES.find((size) => size.limit === built.limit)?.name ?? `${built.limit} points`}
              </Link>
              {(built.detachments ?? (built.detachment ? [{ name: built.detachment, points: null }] : [])).map((detachment) => (
                <span key={detachment.name} className="contents">
                  <span aria-hidden>·</span>
                  <span>
                    {detachment.name}
                    {frozen && detachment.points !== null ? ` · ${detachment.points} DP` : ''}
                  </span>
                </span>
              ))}
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
              <DatasheetPanel
                catalogueId={selectedCatalogueId ?? built.catalogueId}
                entryId={selectedUnit?.entryId ?? null}
                detachmentIds={built.detachmentIds}
                picks={built.picks}
                pickIndex={selected}
                showWeapons
                showRelationships={false}
              />
            </Pane>
          ) : null}
        </div>
      </div>
    </main>
  )
}
