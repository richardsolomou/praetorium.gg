import { createHash } from 'node:crypto'
import type { CatalogueIndex, Condition, ConditionGroup, EntryLink, ModifierGroup, SelectionEntry } from '../core/catalogue'
import { joinKey } from './rulesSource'

/** Project only swaps whose complete equipment bundle resolves inside the datasheet. */
export function withPrintedModelWeaponSwaps(entry: SelectionEntry, index: CatalogueIndex): SelectionEntry {
  const options = entry.selectionEntryGroups?.find((group) => group.name === 'Wargear Options')?.selectionEntries ?? []
  const weapons = (entry.selectionEntryGroups ?? [])
    .filter((group) => group.name === 'Weapon Options')
    .flatMap((group) => group.selectionEntries ?? [])
    .flatMap((option) => option.entryLinks ?? [])
  const modelGroups = new Map<string, string>()
  const applied = new Set<string>()
  const moved = new Set<string>()
  const equipmentRules = new Set<string>()
  const selectionEntryGroups = entry.selectionEntryGroups?.map((group) => ({
    ...group,
    selectionEntries: group.selectionEntries,
    selectionEntryGroups: [
      ...(group.selectionEntryGroups ?? []),
      ...(group.selectionEntries ?? [])
        .filter((model) => model.type === 'model')
        .map((model) => {
          if (model.selectionEntries?.length || model.selectionEntryGroups?.length) return null
          const alternatives: SelectionEntry[] = []
          for (const option of options) {
            const match = /^Any number of models(?: in this unit)? can each have their (.+?) replaced with (.+?)\.$/i.exec(
              option.name ?? '',
            )
            if (!match) continue
            const original = model.entryLinks?.find((link) => joinKey(link.name ?? '') === joinKey(match[1]!))
            if (!original || !index.definitions.has(original.targetId)) continue
            const pieces = match[2]!.split(/ and /i).map((piece) => /^1 (.+)$/.exec(piece)?.[1])
            if (pieces.some((piece) => !piece)) continue
            const id = `profile-model-swap-${createHash('sha256')
              .update(JSON.stringify([model.id, option.id]))
              .digest('hex')
              .slice(0, 20)}`
            const rules: string[] = []
            const targets: string[] = []
            const equipment = pieces.map((piece, at): SelectionEntry | EntryLink | null => {
              const links = weapons.filter((link) => joinKey(link.name ?? '') === joinKey(piece!))
              if (links.length === 1 && index.definitions.has(links[0]!.targetId)) {
                targets.push(links[0]!.targetId)
                return { ...links[0]!, id: `${id}-piece-${at}`, constraints: undefined, modifiers: undefined }
              }
              const profiles =
                entry.profiles?.filter((profile) => profile.typeName === 'Abilities' && joinKey(profile.name ?? '') === joinKey(piece!)) ??
                []
              if (profiles.length !== 1) return null
              rules.push(profiles[0]!.id)
              const description = profiles[0]!.characteristics?.find((characteristic) => characteristic.name === 'Description')?.$text
              const bonus = /^This model has \+(\d+) W\.$/.exec(description ?? '')
              const wounds = model.profiles
                ?.flatMap((profile) => profile.characteristics ?? [])
                .find((characteristic) => characteristic.name === 'W')?.typeId
              return {
                id: `${id}-piece-${at}`,
                name: piece!,
                type: 'upgrade',
                profiles,
                ...(bonus && wounds
                  ? {
                      modifiers: [
                        {
                          type: 'increment',
                          field: wounds,
                          value: Number(bonus[1]),
                          scope: 'model',
                          affects: 'profiles.Unit',
                        },
                      ],
                    }
                  : {}),
              }
            })
            if (equipment.some((piece) => !piece)) continue
            applied.add(option.id)
            targets.forEach((target) => moved.add(target))
            rules.forEach((rule) => equipmentRules.add(rule))
            const replacementId = `${id}-replacement`
            const name = `${model.name} with ${pieces.join(' and ')}`
            alternatives.push({
              ...model,
              id: replacementId,
              name,
              constraints: model.constraints
                ?.filter((constraint) => constraint.type === 'max')
                .map((constraint) => ({ ...constraint, id: `${replacementId}-${constraint.id}` })),
              profiles: model.profiles?.map((profile) => ({
                ...profile,
                id: `${replacementId}-${profile.id}`,
                name: profile.typeName === 'Unit' ? name : profile.name,
              })),
              entryLinks: [
                ...(model.entryLinks ?? [])
                  .filter((link) => link.id !== original.id)
                  .map((link) => ({ ...link, id: `${replacementId}-${link.id}` })),
                ...equipment
                  .filter((piece): piece is EntryLink => piece !== null && 'targetId' in piece)
                  .map((link) => ({
                    ...link,
                    constraints: [{ id: `${link.id}-min`, field: 'selections', scope: 'parent', type: 'min' as const, value: 1 }],
                  })),
              ],
              selectionEntries: [
                ...(model.selectionEntries ?? []),
                ...equipment
                  .filter((piece): piece is SelectionEntry => piece !== null && !('targetId' in piece))
                  .map((piece) => ({
                    ...piece,
                    constraints: [{ id: `${piece.id}-min`, field: 'selections', scope: 'parent', type: 'min' as const, value: 1 }],
                  })),
              ],
            })
          }
          if (!alternatives.length) return null
          modelGroups.set(model.id, `profile-model-loadouts-${model.id}`)
          return {
            id: `profile-model-loadouts-${model.id}`,
            name: model.name,
            defaultSelectionEntryId: model.id,
            constraints: model.constraints?.map((constraint) => ({
              ...constraint,
              id: `profile-model-loadouts-${model.id}-${constraint.id}`,
            })),
            selectionEntries: [
              { ...model, constraints: model.constraints?.filter((constraint) => constraint.type === 'max') },
              ...alternatives,
            ],
          }
        })
        .filter((loadout) => loadout !== null),
    ],
  }))
  if (!applied.size) return entry
  const condition = (value: Condition): Condition =>
    value.field === 'selections' && value.includeChildSelections && modelGroups.has(value.childId ?? '')
      ? { ...value, childId: modelGroups.get(value.childId!) }
      : value
  const conditions = <T extends { conditions?: Condition[]; conditionGroups?: ConditionGroup[] }>(value: T): T => ({
    ...value,
    conditions: value.conditions?.map(condition),
    conditionGroups: value.conditionGroups?.map(conditions),
  })
  const modifierGroup = (value: ModifierGroup): ModifierGroup => ({
    ...conditions(value),
    modifiers: value.modifiers?.map(conditions),
    modifierGroups: value.modifierGroups?.map(modifierGroup),
  })
  return {
    ...entry,
    modifiers: entry.modifiers?.map(conditions),
    modifierGroups: entry.modifierGroups?.map(modifierGroup),
    profiles: entry.profiles?.filter((profile) => !equipmentRules.has(profile.id)),
    selectionEntryGroups: selectionEntryGroups?.flatMap((group) => {
      if (group.name !== 'Wargear Options' && group.name !== 'Weapon Options')
        return [
          {
            ...group,
            selectionEntries: group.selectionEntries?.filter(
              (model) => !group.selectionEntryGroups?.some((loadout) => loadout.defaultSelectionEntryId === model.id),
            ),
          },
        ]
      const selectionEntries = group.selectionEntries?.filter((option) =>
        group.name === 'Wargear Options'
          ? !applied.has(option.id)
          : !(option.entryLinks?.length === 1 && moved.has(option.entryLinks[0]!.targetId)),
      )
      return selectionEntries?.length || group.entryLinks?.length ? [{ ...group, selectionEntries }] : []
    }),
  }
}
