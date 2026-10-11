import type { RosterPick } from './roster'

export function unavailableRosterSelections(
  picks: readonly RosterPick[],
  units: readonly {
    key: number
    choices: readonly { key: string; options?: readonly { id: string }[] }[]
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
    return [
      ...Object.entries(pick.choices ?? {}).flatMap(([key, id]) => (hasOption(key, id) ? [] : [problem('choice', key, id)])),
      ...Object.entries(pick.spreads ?? {}).flatMap(([key, counts]) =>
        Object.entries(counts).flatMap(([id, count]) => (count === 0 || hasOption(key, id) ? [] : [problem('spread', key, id)])),
      ),
      ...Object.entries(pick.toggles ?? {}).flatMap(([key, count]) => (count === 0 || toggles.has(key) ? [] : [problem('toggle', key)])),
    ]
  })
}
