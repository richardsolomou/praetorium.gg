import { useQuery } from '@tanstack/react-query'
import { useNavigate, useRouter, useRouterState } from '@tanstack/react-router'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Roster } from '../../core/battle'
import { factionQuery, priceQuery } from '../queries'
import { rosterWaivers } from './FormatWaivers'
import { RosterEditor } from './RosterEditor'
import { RosterBody, RosterHeader, RosterShell, RosterUnits } from './RosterPresentation'
import { DatasheetPanel } from './builder/DatasheetPanel'
import { GROUPS } from './builder/groups'
import { Loadout } from './builder/Loadout'
import { Pane } from './builder/Pane'
import { Section } from './builder/Section'
import { UnitCard } from './builder/UnitCard'

type SnapshotPaneHistory = { workspace: string; unitKey: string }
type SnapshotLocationState = { rosterSnapshotPane?: SnapshotPaneHistory }

export function BattleRosterSnapshot({ roster }: { roster: Roster }) {
  const built = roster.built
  const frozen = !roster.id
  const factionResult = useQuery({ ...factionQuery(built?.catalogueId ?? ''), enabled: Boolean(built) })
  const faction = factionResult.data
  const frozenPoints = frozen && built ? built.units.reduce((total, unit) => total + unit.points, 0) : null
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
          waivedRules: built.waivedRules ?? [],
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
          factionLoading={Boolean(built) && factionResult.isPending}
          points={frozenPoints}
          limit={built?.limit}
          detachments={displayedDetachments}
          disposition={built?.disposition}
          waivers={rosterWaivers(built)}
        />
        {built ? (
          <SnapshotRosterContents built={built} frozen={frozen} text={roster.text} />
        ) : (
          <RosterBody>
            <RosterUnits>
              <pre className="my-3 overflow-auto whitespace-pre-wrap border border-edge bg-panel p-3 font-rules text-sm select-text">
                {roster.text}
              </pre>
            </RosterUnits>
          </RosterBody>
        )}
      </RosterShell>
    </main>
  )
}

function SnapshotRosterContents({ built, frozen, text }: { built: NonNullable<Roster['built']>; frozen: boolean; text: string }) {
  const navigate = useNavigate()
  const router = useRouter()
  const path = useRouterState({ select: (state) => state.location.href.split('#', 1)[0] ?? state.location.pathname })
  const [selected, setSelected] = useState<number | null>(null)
  const [loadoutInline, setLoadoutInline] = useState(true)
  const paneHistory = useRouterState({
    select: (state) => {
      if (state.location.hash !== 'roster-pane') return null
      const pane = (state.location.state as SnapshotLocationState).rosterSnapshotPane
      return pane?.workspace === path ? pane : null
    },
  })
  const paneHistoryRef = useRef<SnapshotPaneHistory | null>(null)
  const paneHistoryBackPending = useRef(false)
  const keepPaneAfterBack = useRef(false)
  const paneClosing = useRef(false)
  const { data: priced } = useQuery({
    ...priceQuery(built.catalogueId, built.detachmentIds ?? [], built.disposition, built.limit, built.picks ?? [], built.waivedRules ?? []),
    enabled: Boolean(built.picks && built.detachmentIds && (!frozen || selected !== null)),
  })
  const hasRosterCards = built.units.some((unit) => unit.group !== undefined)
  const selectedUnit = selected === null ? null : (built.units[selected] ?? null)
  const selectedPricedUnit = selected === null ? null : (priced?.units[selected] ?? null)
  const selectedCatalogueId = selected === null ? built.catalogueId : (built.picks?.[selected]?.catalogueId ?? built.catalogueId)

  const backFromPane = useCallback(() => {
    if (paneHistoryBackPending.current) return
    paneHistoryBackPending.current = true
    router.history.back()
  }, [router])

  const pushPaneHistory = useCallback(
    (pane: SnapshotPaneHistory) => {
      paneHistoryRef.current = pane
      void navigate({
        href: `${path}#roster-pane`,
        hashScrollIntoView: false,
        replace: Boolean(paneHistory),
        resetScroll: false,
        state: (current) => ({ ...current, rosterSnapshotPane: pane }) as typeof current,
      })
    },
    [navigate, paneHistory, path],
  )

  useLayoutEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)')
    const sync = () => setLoadoutInline(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (!paneHistory) {
      paneHistoryBackPending.current = false
      if (!paneHistoryRef.current) return
      paneHistoryRef.current = null
      if (keepPaneAfterBack.current) {
        keepPaneAfterBack.current = false
        paneClosing.current = false
        return
      }
      paneClosing.current = true
      setSelected(null)
      return
    }

    paneHistoryRef.current = paneHistory
    const selectedIndex = built.units.findIndex((unit) => unit.key === paneHistory.unitKey)
    if (selectedIndex !== -1) setSelected(selectedIndex)
    else {
      paneHistoryRef.current = null
      paneClosing.current = true
      setSelected(null)
      backFromPane()
    }
  }, [backFromPane, built.units, paneHistory])

  useEffect(() => {
    if (!loadoutInline || !paneHistory) return
    keepPaneAfterBack.current = true
    backFromPane()
  }, [backFromPane, loadoutInline, paneHistory])

  useEffect(() => {
    if (selected === null) {
      paneClosing.current = false
      return
    }
    if (loadoutInline || paneHistoryRef.current || paneClosing.current) return
    const unitKey = built.units[selected]?.key
    if (typeof unitKey === 'string') pushPaneHistory({ workspace: path, unitKey })
  }, [built.units, loadoutInline, path, pushPaneHistory, selected])

  const selectUnit = useCallback(
    (index: number) => {
      setSelected(index)
      const unitKey = built.units[index]?.key
      if (!loadoutInline && typeof unitKey === 'string') pushPaneHistory({ workspace: path, unitKey })
    },
    [built.units, loadoutInline, path, pushPaneHistory],
  )

  const closePane = useCallback(() => {
    if (paneHistory) backFromPane()
    else setSelected(null)
  }, [backFromPane, paneHistory])

  return (
    <RosterBody>
      <RosterUnits>
        {hasRosterCards ? (
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
                    onSelect={built.picks && built.detachmentIds ? () => selectUnit(index) : undefined}
                    joined={unit.joined ?? []}
                    editable={false}
                  />
                ))}
              </Section>
            ) : null
          })
        ) : (
          <pre className="my-3 overflow-auto whitespace-pre-wrap border border-edge bg-panel p-3 font-rules text-sm select-text">
            {text}
          </pre>
        )}
      </RosterUnits>
      {built.picks && built.detachmentIds ? (
        <Pane
          variant="loadout"
          open={selectedUnit !== null}
          threeColumn={false}
          title={selectedUnit?.name ?? 'Unit'}
          ariaLabel="Datasheet"
          onClose={closePane}
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
            catalogueId={selectedCatalogueId}
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
                catalogueId={selectedCatalogueId}
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
  )
}
