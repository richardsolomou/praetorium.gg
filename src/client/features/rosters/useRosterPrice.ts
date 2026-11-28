import { useQuery } from '@tanstack/react-query'
import { type Dispatch, type SetStateAction, useLayoutEffect, useMemo, useRef } from 'react'
import type { RosterPick } from '../../../core/roster'
import { type Fielded, setupPriceQuery } from '../../queries'
import { samePriceContext, survivingUnits } from './builder/pricePlaceholder'
import { settledWarlord, withWarlord } from './builder/usePicks'
import type { KeyedPick } from './rosterPicks'

const NO_UNITS = [] as const

/**
 * The server's price and legality for the list as it stands.
 *
 * The answer also says how many of each datasheet the list may hold, and settles
 * which unit is the Warlord once the units it judged are known.
 */
export function useRosterPrice({
  setup,
  picks,
  positioned,
  editable,
  frozen,
  selected,
  setPicks,
}: {
  setup: Parameters<typeof setupPriceQuery>[0]
  picks: readonly KeyedPick[]
  positioned: readonly RosterPick[]
  editable: boolean
  /** A frozen list's fielding, which reads it on the rules version it was played on. */
  frozen: Fielded
  selected: number | null
  setPicks: Dispatch<SetStateAction<KeyedPick[]>>
}) {
  const priceRequest = setupPriceQuery(frozen ? { ...setup, fielded: frozen } : setup, positioned, editable)
  const {
    data: priced,
    dataUpdatedAt: pricedAt,
    isPlaceholderData: pricePending,
    isPending: priceLoading,
    isError: priceFailed,
    refetch: retryPrice,
  } = useQuery({
    ...priceRequest,
    // A frozen list already carries its cards and its total; the price is only the
    // applied datasheet behind a unit somebody opened.
    enabled: Boolean(setup.catalogueId) && (!frozen || selected !== null),
    /**
     * The last answer, with whatever the list has since let go of taken out of it.
     *
     * The total stays as it was until the new one lands, the same way an added unit
     * is not counted until then: a number one request behind corrects itself, and a
     * number this page worked out for itself could be wrong in ways it cannot know.
     */
    placeholderData: (previous, previousQuery) => {
      if (!previous || !samePriceContext(previousQuery?.queryKey, priceRequest.queryKey)) return undefined
      const kept = survivingUnits(previousQuery?.queryKey.at(-1), positioned)
      if (!kept) return undefined
      if (kept.length === previous.units.length && kept.every((at, index) => at === index)) return previous
      const units = []
      for (const at of kept) {
        const unit = previous.units[at]
        if (!unit) break
        units.push(unit)
      }
      return { ...previous, units }
    },
  })
  const evaluatedPicks = useRef(new Map(picks.map((pick) => [pick.key, pick])))
  const evaluatedAt = useRef(0)
  const evaluatedFor = useRef<readonly KeyedPick[] | null>(null)
  useLayoutEffect(() => {
    // A list the cache already priced, as one returned to by giving a VS pick's Warlord up, answers with its earlier time.
    if (!priced || pricePending || (pricedAt <= evaluatedAt.current && evaluatedFor.current === picks)) return
    const regrouped = picks.length !== evaluatedPicks.current.size || picks.some((pick) => !evaluatedPicks.current.has(pick.key))
    evaluatedAt.current = Math.max(evaluatedAt.current, pricedAt)
    evaluatedFor.current = picks
    evaluatedPicks.current = new Map(picks.map((pick) => [pick.key, pick]))
    const warlord = editable ? settledWarlord(picks, priced.units, regrouped) : null
    if (warlord)
      setPicks((current) =>
        current.map((pick, at) => {
          const toggle = priced.units[at]?.toggles.find((candidate) => candidate.name === 'Warlord')
          return toggle ? withWarlord(pick, priced.units[at], toggle.key, at === warlord.index) : pick
        }),
      )
  }, [editable, picks, pricePending, priced, pricedAt, setPicks])

  const unitLimits = useMemo(
    () => new Map(!priceFailed ? priced?.unitLimits?.map((unit) => [unit.id, unit.limit]) : []),
    [priceFailed, priced?.unitLimits],
  )
  const limitUnlocks = useMemo(
    () =>
      new Map(!priceFailed ? priced?.unitLimits?.flatMap((unit) => (unit.unlockedBy ? [[unit.id, unit.unlockedBy] as const] : [])) : []),
    [priceFailed, priced?.unitLimits],
  )
  const units = priced?.units ?? NO_UNITS

  // What each datasheet the builder fields by VS Data starts as when added.
  const firstPicks = useMemo(
    () => new Map(!priceFailed ? priced?.unitLimits?.flatMap((unit) => (unit.vs ? [[unit.id, unit.vs] as const] : [])) : []),
    [priceFailed, priced?.unitLimits],
  )
  return {
    priceRequest,
    priced,
    units,
    pricePending,
    priceLoading,
    priceFailed,
    retryPrice,
    unitLimits,
    limitUnlocks,
    firstPicks,
    evaluatedPicks,
  }
}
