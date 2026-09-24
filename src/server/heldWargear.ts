import { type ModelKind, modelRowPieces, modelRowCount, modelRowSources } from '../core/modelKinds'
import { isUnitCompositionChoice } from '../core/unitChoices'
import { wargearKey } from '../core/wargear'

export type ReplacementSource = { choiceKey: string; optionId: string }
export const replacementKey = ({ choiceKey, optionId }: ReplacementSource) => `${choiceKey}\0${optionId}`

/**
 * What a unit is carrying, counted the way its loadout is drawn.
 *
 * The roster card and the loadout panel answer the same question, so they read the
 * same fold. Anything the model kinds never mention — an enhancement, a choice that
 * belongs to the unit rather than to one of its models — is still the catalogue's to
 * report, and is carried through untouched.
 */
export function heldWargear(
  models: readonly ModelKind[],
  choices: readonly {
    key: string
    name?: string
    options: readonly { id: string; name?: string; count: number; pieceCounts?: readonly { name: string; count: number }[] }[]
  }[],
  catalogued: readonly { name: string; count: number }[],
): { name: string; count: number }[] {
  if (!models.length) return [...catalogued]
  const countOf = (choiceKey: string, optionId: string) =>
    choices.find((choice) => choice.key === choiceKey)?.options.find((option) => option.id === optionId)?.count ?? 0
  const held = new Map<string, { name: string; count: number }>()
  const named = new Set<string>()
  const add = (name: string, count: number) => {
    const key = wargearKey(name)
    named.add(key)
    if (count <= 0) return
    const seen = held.get(key)
    if (seen) seen.count += count
    else held.set(key, { name, count })
  }

  for (const kind of models) {
    const bodies = kind.members.reduce(
      (total, member) => total + (member.choiceKey ? countOf(member.choiceKey, member.id) : member.baseCount),
      0,
    )
    for (const piece of kind.fixed) add(piece.name, piece.count ?? bodies)
    for (const row of kind.rows) {
      const count = modelRowCount(row, ({ choiceKey, optionId }) => countOf(choiceKey, optionId))
      for (const name of modelRowPieces(row, kind.rows)) add(name, count)
    }
  }
  const modeled = new Set(
    models.flatMap((kind) => [
      ...kind.members.flatMap((member) => (member.choiceKey ? [replacementKey({ choiceKey: member.choiceKey, optionId: member.id })] : [])),
      ...kind.rows.flatMap((row) => modelRowSources(row).map(replacementKey)),
    ]),
  )
  for (const choice of choices) {
    if (choice.name && isUnitCompositionChoice({ name: choice.name, options: choice.options })) continue
    for (const option of choice.options) {
      if (option.count <= 0 || modeled.has(replacementKey({ choiceKey: choice.key, optionId: option.id }))) continue
      const pieces = option.pieceCounts ?? (option.name ? [{ name: option.name, count: option.count }] : [])
      for (const piece of pieces) add(piece.name, piece.count)
    }
  }
  for (const piece of catalogued) {
    const key = wargearKey(piece.name)
    if (!named.has(key)) add(piece.name, piece.count)
  }
  return [...held.values()]
}
