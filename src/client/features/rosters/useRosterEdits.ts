import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { posthog } from 'posthog-js'
import { toast } from 'sonner'
import { type Dispatch, type SetStateAction, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { attachedUnitCount } from '../../../core/attachedUnits'
import { canTransport } from '../../../core/battle'
import type { RosterPick } from '../../../core/roster'
import { frozenUnits } from '../../../core/rosterSnapshot'
import { unitBattleDetailsQuery } from '../../queries'
import { advanceOnboarding } from '../onboarding/onboarding'
import { editedPicks, embarkCards, putBacks } from './builder/embarkModel'
import { samePriceContext } from './builder/pricePlaceholder'
import { type AttachLink, batchFits, heldWith, pickEditor, requestedUnit } from './builder/usePicks'
import type { FrozenRoster } from './ListBuilder'
import type { KeyedPick } from './rosterPicks'
import type { useRosterPrice } from './useRosterPrice'

// The embark judgement and the add queue read refs while rendering and settle state once a price lands.
// oxlint-disable react/refs, react/set-state-in-effect, react/memo-dependencies

/**
 * Every edit the builder makes to its picks, and the telemetry each one reports.
 *
 * Adds wait in a queue for the price that describes the list they are added to,
 * because only that price says whether the roster's limits leave room for them.
 */
export function useRosterEdits({
  picks,
  setPicks,
  annotated,
  held,
  allocateKey,
  catalogueId,
  price: { priced, units, pricePending, priceLoading, priceFailed, priceRequest, unitLimits, limitUnlocks },
  frozen,
  building,
  editable,
  locked,
  requested,
  setSelected,
}: {
  picks: KeyedPick[]
  setPicks: Dispatch<SetStateAction<KeyedPick[]>>
  annotated: readonly RosterPick[]
  held: Readonly<Record<string, number>>
  allocateKey: () => number
  catalogueId: string
  price: ReturnType<typeof useRosterPrice>
  frozen?: FrozenRoster
  building: boolean
  editable: boolean
  locked: boolean
  requested?: { entryId: string; onSettled: () => void }
  setSelected: (index: number | null) => void
}) {
  const edit = useMemo(
    () => pickEditor(setPicks, { catalogueId, units, limits: pricePending ? undefined : unitLimits }, allocateKey),
    [allocateKey, catalogueId, pricePending, setPicks, unitLimits, units],
  )
  const carried = units.some(canTransport)
  const { data: battleDetails, isPlaceholderData: battleDetailsPending } = useQuery({
    ...unitBattleDetailsQuery(
      catalogueId,
      picks.map((pick) => pick.entryId),
    ),
    enabled: !frozen && carried,
    placeholderData: keepPreviousData,
  })
  const embarksPending = pricePending || battleDetailsPending
  // The picks the last judgement described, so the next one knows which units the player has since changed.
  const judgedPicks = useRef(picks)
  // Judged only once the price and details describe these picks, so positions line up.
  const currentEmbarks = useMemo(
    () =>
      !frozen && priced && battleDetails && !embarksPending
        ? embarkCards(
            frozenUnits(annotated, priced.units, battleDetails),
            (at) => picks[priced.units[at]!.key]!.key,
            editedPicks(judgedPicks.current, picks),
          )
        : null,
    [annotated, battleDetails, embarksPending, frozen, picks, priced],
  )
  if (currentEmbarks) judgedPicks.current = picks
  // The last judgement stays on screen while an edit is priced; it names units by key, so a press still means the same units.
  const shownEmbarks = useRef(currentEmbarks)
  if (currentEmbarks) shownEmbarks.current = currentEmbarks
  const frozenEmbarks = useMemo(() => (frozen ? embarkCards(frozen.units).cards : null), [frozen])
  // An edit that leaves a unit unable to start in its transport, such as a larger squad, puts it back on the battlefield.
  // No details at all means the army data could not be read, which says nothing about what fits.
  const going = useMemo(
    () => (currentEmbarks && battleDetails?.length ? putBacks(currentEmbarks.dropped, picks) : []),
    [battleDetails?.length, currentEmbarks, picks],
  )
  useEffect(() => {
    if (!building || !going.length) return
    edit.disembark(going.map(({ pick }) => pick.key))
    // Keyed by unit, so an effect that runs twice shows one toast.
    for (const { name: unit, transport, pick } of going) {
      toast(`${unit} no longer fits in ${transport}, so it starts on the battlefield.`, { id: `put-back-${pick.key}`, duration: 3000 })
    }
  }, [building, edit, going])
  const judged = shownEmbarks.current
  const embarks = carried && judged ? judged.cards : null
  const editor = useRef(edit)
  /**
   * What an edit reports is the list it leaves behind, read once the edit has landed.
   * The size of a list is not the number of picks in it, so no edit is a reliable
   * step of one: duplicating an attached character adds a pick to a unit that was
   * already there, and dropping the unit it joined leaves it standing on its own.
   */
  const reporting = useRef<{
    event: 'roster_unit_added' | 'roster_unit_removed' | 'roster_unit_duplicated'
    reference?: 'datasheet' | 'loadout'
  } | null>(null)
  useLayoutEffect(() => {
    editor.current = edit
    const report = reporting.current
    if (!report) return
    reporting.current = null
    posthog.capture(report.event, { unit_count: attachedUnitCount(picks), ...(report.reference ? { reference: report.reference } : {}) })
    if (report.event === 'roster_unit_added') advanceOnboarding('roster', 'roster-add', 'roster-list')
  }, [edit, picks])
  const drop = useCallback(
    (index: number) => {
      editor.current.drop(index)
      reporting.current = { event: 'roster_unit_removed' }
      setSelected(null)
    },
    [setSelected],
  )
  const [requestRefusal, setRequestRefusal] = useState<string | null>(null)
  const [queuedAdds, setQueuedAdds] = useState<
    { entryId: string; context: readonly unknown[]; link?: AttachLink; loadout?: readonly RosterPick[] }[]
  >([])
  const queueAdd = (entryId: string, extra: { link?: AttachLink; loadout?: readonly RosterPick[] }) => {
    const adding = extra.loadout ?? [{ entryId }]
    const exceedsRoster = (queuedPicks: readonly unknown[]) => picks.length + queuedPicks.length + adding.length > 100
    setRequestRefusal(exceedsRoster(queuedAdds.flatMap((entry) => entry.loadout ?? [entry])) ? 'A roster can hold up to 100 units.' : null)
    setQueuedAdds((current) => {
      const queuedPicks = current.flatMap((entry) => entry.loadout ?? [entry])
      if (exceedsRoster(queuedPicks) || !batchFits(adding, held, unitLimits, queuedPicks)) return current
      return [...current, { entryId, context: priceRequest.queryKey, ...extra }]
    })
  }
  // Stable, so a keystroke in the picker's search does not redraw every row it lists.
  const latestQueueAdd = useRef(queueAdd)
  latestQueueAdd.current = queueAdd
  const add = useCallback((entryId: string, link?: AttachLink) => latestQueueAdd.current(entryId, link ? { link } : {}), [])
  const applyLoadout = useCallback((loadout: readonly RosterPick[]) => {
    if (loadout[0]) latestQueueAdd.current(loadout[0].entryId, { loadout })
  }, [])
  useEffect(() => {
    const next = queuedAdds[0]
    if (!next) return
    if (!editable) {
      setQueuedAdds([])
      return
    }
    if (pricePending || priceLoading || priceFailed) return
    setQueuedAdds((current) => current.slice(1))
    if (!samePriceContext(next.context, priceRequest.queryKey)) return
    const wanted = next.loadout ?? [{ entryId: next.entryId }]
    const outcome = wanted
      .map((pick, at) => requestedUnit(pick.entryId, heldWith(held, wanted, at), unitLimits, limitUnlocks))
      .find((answer) => answer.kind === 'refused')
    if (outcome?.kind === 'refused') {
      setRequestRefusal(outcome.message)
      return
    }
    if (next.loadout) editor.current.apply(next.loadout)
    else editor.current.add(next.entryId, next.link)
    reporting.current = { event: 'roster_unit_added', ...(next.loadout ? { reference: 'loadout' as const } : {}) }
    if (next.link) posthog.capture('roster_attachment_updated', { attached: true })
  }, [editable, held, limitUnlocks, priceFailed, priceLoading, pricePending, priceRequest.queryKey, queuedAdds, unitLimits])
  const requestHandled = useRef(false)
  const requestedHeld = requested ? (held[requested.entryId] ?? 0) : 0
  const limitsKnown = Boolean(priced) && !pricePending && !priceFailed
  useEffect(() => {
    if (!requested || requestHandled.current) return
    if (locked) {
      requestHandled.current = true
      setRequestRefusal('This roster is locked. Unlock it to add units.')
      requested.onSettled()
      return
    }
    if (!editable) return
    const outcome = requestedUnit(requested.entryId, requestedHeld, limitsKnown ? unitLimits : null, limitUnlocks)
    if (outcome.kind === 'pending') return
    requestHandled.current = true
    if (outcome.kind === 'add') {
      editor.current.add(requested.entryId)
      reporting.current = { event: 'roster_unit_added', reference: 'datasheet' }
    } else {
      setRequestRefusal(outcome.message)
      posthog.capture('roster_unit_add_refused', { reason: outcome.reason, reference: 'datasheet' })
    }
    requested.onSettled()
  }, [editable, limitUnlocks, limitsKnown, locked, requested, requestedHeld, unitLimits])
  const duplicate = useCallback((index: number) => {
    editor.current.duplicate(index)
    reporting.current = { event: 'roster_unit_duplicated' }
  }, [])
  const join = useCallback((index: number, targetKey: number | undefined) => {
    editor.current.join(index, targetKey)
    posthog.capture('roster_attachment_updated', { attached: targetKey !== undefined })
  }, [])
  const embark = useCallback((passengerKey: number, transportKey: number | undefined) => {
    editor.current.embark(passengerKey, transportKey)
    posthog.capture('roster_embark_updated', { embarked: transportKey !== undefined })
  }, [])

  return { edit, embarks, frozenEmbarks, drop, add, applyLoadout, duplicate, join, embark, requestRefusal }
}
