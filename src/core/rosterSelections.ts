import type { RosterPick } from './roster'

type OfferedChoice = { key: string; room?: number; chosen?: string; options?: readonly { id: string }[] }

/**
 * Whether a saved selection sits under an either-or option the player switched away from.
 * The builder keeps it so that switching back restores it; building the unit never reaches it.
 */
function rememberedUnderAnotherOption(key: string, offered: readonly OfferedChoice[]) {
  return offered.some(
    (choice) =>
      choice.room === 1 && choice.options?.some((option) => option.id !== choice.chosen && key.startsWith(`${choice.key}/${option.id}/`)),
  )
}

export function unavailableRosterSelections(
  picks: readonly RosterPick[],
  units: readonly {
    key: number
    choices: readonly OfferedChoice[]
    toggles: readonly { key: string }[]
  }[],
  resolveOption?: (pickIndex: number, key: string, optionId: string) => { key: string; optionId: string } | null,
) {
  const byKey = new Map(units.map((unit) => [unit.key, unit]))
  return picks.flatMap((pick, pickIndex) => {
    const unit = byKey.get(pickIndex)
    const problem = (kind: 'datasheet' | 'choice' | 'spread' | 'toggle', key?: string, optionId?: string) => ({
      pickIndex,
      entryId: pick.entryId,
      kind,
      ...(key === undefined ? {} : { key }),
      ...(optionId === undefined ? {} : { optionId }),
    })
    if (!unit) return [problem('datasheet')]
    const choices = new Map(unit.choices.map((choice) => [choice.key, new Set(choice.options?.map((option) => option.id))]))
    const toggles = new Set(unit.toggles.map((toggle) => toggle.key))
    const hasOption = (key: string, optionId: string) => {
      const resolved = resolveOption?.(pickIndex, key, optionId)
      return choices.get(resolved?.key ?? key)?.has(resolved?.optionId ?? optionId)
    }
    const applied = <V>(entries: Record<string, V> | undefined) =>
      Object.entries(entries ?? {}).filter(([key]) => !rememberedUnderAnotherOption(key, unit.choices))
    return [
      ...applied(pick.choices).flatMap(([key, id]) => (hasOption(key, id) ? [] : [problem('choice', key, id)])),
      ...applied(pick.spreads).flatMap(([key, counts]) =>
        Object.entries(counts).flatMap(([id, count]) => (count === 0 || hasOption(key, id) ? [] : [problem('spread', key, id)])),
      ),
      ...Object.entries(pick.toggles ?? {}).flatMap(([key, count]) => (count === 0 || toggles.has(key) ? [] : [problem('toggle', key)])),
    ]
  })
}

export type UnavailableSelection = ReturnType<typeof unavailableRosterSelections>[number]

/**
 * A pick without the selections reported unavailable at its position, leaving every
 * other remembered choice alone. A report for another datasheet changes nothing, so a
 * list reordered since the report cannot lose the wrong unit's choices.
 */
export function withoutUnavailableSelections<T extends Pick<RosterPick, 'entryId' | 'choices' | 'spreads' | 'toggles'>>(
  pick: T,
  pickIndex: number,
  unavailable: readonly UnavailableSelection[],
): T {
  const dropped = unavailable.filter((problem) => problem.pickIndex === pickIndex && problem.entryId === pick.entryId)
  if (!dropped.length) return pick
  const choices = { ...pick.choices }
  const spreads = { ...pick.spreads }
  const toggles = { ...pick.toggles }
  for (const { kind, key, optionId } of dropped) {
    if (key === undefined) continue
    if (kind === 'choice') delete choices[key]
    if (kind === 'toggle') delete toggles[key]
    if (kind === 'spread' && optionId !== undefined && spreads[key]) {
      const { [optionId]: _removed, ...rest } = spreads[key]
      if (Object.keys(rest).length) spreads[key] = rest
      else delete spreads[key]
    }
  }
  return {
    ...pick,
    ...(pick.choices ? { choices } : {}),
    ...(pick.spreads ? { spreads } : {}),
    ...(pick.toggles ? { toggles } : {}),
  }
}

type BuiltChoice = { key: string; chosen: string; room: number; options: readonly { id: string; count: number }[] }

/**
 * A saved pick's selections rewritten to what the app builds from it.
 *
 * Only a group the build offers under the same key is compared, so selections
 * remembered under an either-or option the player switched away from stay for when
 * they switch back. A group saved both as a choice and as counts keeps the counts,
 * which the build applies last. A pick that already agrees is returned unchanged.
 */
export function builtPickSelections<T extends Pick<RosterPick, 'choices' | 'spreads'>>(
  pick: T,
  unit: { choices: readonly BuiltChoice[] },
): T {
  const built = new Map(unit.choices.map((choice) => [choice.key, choice]))
  const countOf = (choice: BuiltChoice, id: string) => choice.options.find((option) => option.id === id)?.count ?? 0
  const spreads = { ...pick.spreads }
  const choices = { ...pick.choices }
  let respread = false
  let rechosen = false
  for (const [key, counts] of Object.entries(pick.spreads ?? {})) {
    const choice = built.get(key)
    if (!choice || Object.entries(counts).every(([id, count]) => countOf(choice, id) === count)) continue
    spreads[key] = Object.fromEntries(choice.options.map((option) => [option.id, option.count]))
    respread = true
  }
  for (const [key, optionId] of Object.entries(pick.choices ?? {})) {
    const choice = built.get(key)
    if (!choice) continue
    if (pick.spreads?.[key]) delete choices[key]
    else if (choice.room !== 1 || choice.chosen === optionId) continue
    else if (choice.chosen) choices[key] = choice.chosen
    else delete choices[key]
    rechosen = true
  }
  return respread || rechosen ? { ...pick, ...(respread ? { spreads } : {}), ...(rechosen ? { choices } : {}) } : pick
}
