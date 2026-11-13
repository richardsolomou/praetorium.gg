import { useQuery } from '@tanstack/react-query'
import { type Dispatch, type SetStateAction, useLayoutEffect, useMemo, useRef } from 'react'
import type { RosterPick } from '../../../core/roster'
import { setupPriceQuery } from '../../queries'
import { samePriceContext, survivingUnits } from './builder/pricePlaceholder'
import { settledWarlord } from './builder/usePicks'
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
  frozen: boolean
  selected: number | null
  setPicks: Dispatch<SetStateAction<KeyedPick[]>>
}) {
  const priceRequest = setupPriceQuery(setup, positioned, editable)
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
      const kept = survivingUnits(previousQuery?.queryKey.at(-1), picks)
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
  useLayoutEffect(() => {
    if (!priced || pricePending || pricedAt <= evaluatedAt.current) return
    const regrouped = picks.length !== evaluatedPicks.current.size || picks.some((pick) => !evaluatedPicks.current.has(pick.key))
    evaluatedAt.current = pricedAt
    evaluatedPicks.current = new Map(picks.map((pick) => [pick.key, pick]))
    const warlord = editable ? settledWarlord(picks, priced.units, regrouped) : null
    if (warlord)
      setPicks((current) =>
        current.map((pick, at) => {
          const toggle = priced.units[at]?.toggles.find((candidate) => candidate.name === 'Warlord')
          return toggle ? { ...pick, toggles: { ...pick.toggles, [toggle.key]: at === warlord.index ? 1 : 0 } } : pick
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

  return { priceRequest, priced, units, pricePending, priceLoading, priceFailed, retryPrice, unitLimits, limitUnlocks, evaluatedPicks }
}
