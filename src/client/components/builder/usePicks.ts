import { type Dispatch, type SetStateAction, useMemo, useState } from 'react'
import type { RosterPick } from '../../../core/roster'
import { type KeyedPick, positionedPicks } from '../../rosterPicks'

/** Only what an edit needs to read back off the priced list. */
type SizedUnit = { size: { models: number }; toggles: { key: string; name: string }[] }

/**
 * The list being edited, in the two shapes the builder reads it in.
 *
 * Picks carry their own key: the same datasheet may legitimately appear twice, so a
 * key is the only thing that tells two of them apart while they are being moved
 * around. Everything the picks are sent to counts positions instead, which is what
 * `positioned` is for — the price, the datasheet and the saved row alike.
 */
export function usePicks(initial: readonly RosterPick[]) {
  const [picks, setPicks] = useState<KeyedPick[]>(() => initial.map((pick, key) => ({ ...pick, key })))
  const positioned = useMemo(() => positionedPicks(picks), [picks])
  /** How many of each datasheet the list already holds, so the picker can say so. */
  const held = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const pick of picks) counts[pick.entryId] = (counts[pick.entryId] ?? 0) + 1
    return counts
  }, [picks])

  return { picks, setPicks, positioned, held }
}

/**
 * Every edit a player can make to the list.
 *
 * A plain factory rather than a hook, so it can be handed the priced list — which is
 * the server's answer to these very picks, and therefore only known after they are.
 */
export function pickEditor(
  setPicks: Dispatch<SetStateAction<KeyedPick[]>>,
  context: { catalogueId: string; units: readonly (SizedUnit | undefined)[] },
) {
  const editAt = (index: number, edit: (pick: KeyedPick) => KeyedPick) =>
    setPicks((current) => current.map((pick, at) => (at === index ? edit(pick) : pick)))

  /**
   * Keys are numbered from the list as it stands, so two additions in one render
   * cannot both claim the same one.
   */
  const insert = (choose: (picks: readonly KeyedPick[]) => { pick: RosterPick; after?: number } | null) =>
    setPicks((current) => {
      const chosen = choose(current)
      if (!chosen) return current
      const keyed = { ...chosen.pick, key: Math.max(-1, ...current.map((held) => held.key)) + 1 }
      const { after } = chosen
      return after === undefined ? [...current, keyed] : [...current.slice(0, after + 1), keyed, ...current.slice(after + 1)]
    })

  return {
    add: (entryId: string) => insert(() => ({ pick: { entryId, catalogueId: context.catalogueId } })),

    duplicate: (index: number) => insert((current) => (current[index] ? { pick: current[index], after: index } : null)),

    /** Everything standing with the dropped unit is left standing alone, never pointing at a gap. */
    drop: (index: number) =>
      setPicks((current) => {
        const going = current[index]?.key
        return current.flatMap((pick, at) => (at === index ? [] : [pick.attachedTo === going ? { ...pick, attachedTo: undefined } : pick]))
      }),

    resize: (index: number, models: number) => editAt(index, (pick) => ({ ...pick, models })),

    choose: (index: number, key: string, optionId: string) =>
      editAt(index, (pick) => {
        const choices = { ...pick.choices }
        if (optionId) choices[key] = optionId
        else delete choices[key]
        return { ...pick, choices }
      }),

    /** How many of each option a group holds, leaving the unit's other groups alone. */
    spread: (index: number, key: string, counts: Record<string, number>) =>
      editAt(index, (pick) => ({
        ...pick,
        models: pick.models ?? context.units[index]?.size.models,
        spreads: { ...pick.spreads, [key]: { ...pick.spreads?.[key], ...counts } },
      })),

    /**
     * A toggle on one unit. The warlord is the army's one warlord, so claiming it
     * gives up every other claim rather than leaving two on the list.
     */
    toggle: (index: number, key: string, name: string, enabled: boolean) =>
      setPicks((current) =>
        current.map((pick, at) => {
          const toggles = { ...pick.toggles }
          if (name === 'Warlord' && enabled) {
            for (const candidate of context.units[at]?.toggles ?? []) if (candidate.name === name) toggles[candidate.key] = 0
          }
          return at === index ? { ...pick, toggles: { ...toggles, [key]: enabled ? 1 : 0 } } : { ...pick, toggles }
        }),
      ),

    join: (index: number, targetKey: number | undefined) => editAt(index, (pick) => ({ ...pick, attachedTo: targetKey })),

    /** A new faction is a new list: nothing picked from the old book still applies. */
    clear: () => setPicks([]),
  }
}
