import type { Datasheet } from '../../../server/catalogue'
import {
  addsModel,
  changeBy,
  choiceRemoval,
  type LoadoutChoice,
  type LoadoutModel,
  type LoadoutOption,
  loadoutRowCount,
  loadoutRowSources,
  loadoutInstructions,
  modelCount,
  orderedModelWargear,
  type PoolChange,
  poolHandlers,
  replacementChoice,
  sameWeapon,
  showLoadoutEntry,
  type SpreadCounts,
  spreadHandlers,
  wholeSquadTakes,
} from './loadoutModel'
import type { WeaponProfileData } from './loadoutModel'
import { PickControl, PoolStepper, WargearRow } from './LoadoutControls'

/**
 * One kind of model in the unit, and everything it can carry.
 *
 * A datasheet is read a model at a time — this is the sergeant, this is what he
 * holds — so the wargear a kind of model may take belongs under its own heading
 * rather than in one list the whole squad shares. The count comes from the choices
 * the rows already point at, never from a second copy of the same number.
 */

export function ModelCard({
  model,
  choices,
  stands,
  weapons,
  abilities,
  rules,
  wargearGroups,
  models,
  onChoose,
  onSpread,
  editable,
  controlsDisabled = false,
  showOptions = true,
}: {
  model: LoadoutModel
  choices: LoadoutChoice[]
  /** The choice option this card is the whole of, when its heading is where it is counted. */
  stands: { choice: LoadoutChoice; option: LoadoutOption } | null
  weapons: WeaponProfileData[]
  abilities: Datasheet['abilities']
  rules: Datasheet['keywordRules']
  wargearGroups?: Datasheet['wargearGroups']
  models?: readonly LoadoutModel[]
  onChoose: (key: string, optionId: string) => void
  onSpread: (key: string, counts: SpreadCounts) => void
  editable: boolean
  controlsDisabled?: boolean
  showOptions?: boolean
}) {
  const optionOf = (choiceKey: string, optionId: string) => {
    const choice = choices.find((candidate) => candidate.key === choiceKey)
    const option = choice?.options.find((candidate) => candidate.id === optionId)
    return choice && option ? { choice, option } : null
  }

  const count = modelCount(model, choices)
  const { spend, free } = poolHandlers(model, choices, weapons)
  const press = (changes: PoolChange | null) => (changes ? () => changes.forEach(([key, counts]) => onSpread(key, counts)) : undefined)

  /**
   * How many of this card there are, where the card is one option of a group.
   *
   * The same two shapes a row has, for the same reason: a group with room for several
   * divides itself, and one with room for one is answered rather than counted.
   */
  const heading = () => {
    if (!stands) return null
    const { choice, option } = stands
    if (choice.room > 1 || choice.carried) {
      const handlers = spreadHandlers(choice)
      return {
        onAdd: changeBy(handlers.more(option), choice.key, onSpread),
        onRemove: changeBy(handlers.less(option), choice.key, onSpread),
      }
    }
    const taken = choice.chosen === option.id
    return {
      onAdd: taken ? undefined : () => onChoose(choice.key, option.id),
      onRemove: taken && choice.optional ? () => onChoose(choice.key, '') : undefined,
    }
  }
  const counted = heading()
  if (!showOptions && !count) return null
  const statedInstructions = new Set<string>()

  return (
    <section>
      <p className="eyebrow mb-2 flex items-center justify-between gap-2 text-bone">
        <span className="min-w-0">{model.name}</span>
        {stands && counted ? (
          <PoolStepper name={model.name} count={stands.option.count} editable={editable} disabled={controlsDisabled} {...counted} />
        ) : (
          <span className="readout normal-case text-dim" aria-label={`${model.name} models`}>
            {count}
          </span>
        )}
      </p>
      <ul className="space-y-3">
        {orderedModelWargear(model, choices, weapons).map((entry) => {
          if ('fixed' in entry) {
            const fixedCount = entry.fixed.count ?? count
            if (!showLoadoutEntry(fixedCount, showOptions)) return null
            return (
              <WargearRow
                key={entry.name}
                name={entry.name}
                count={fixedCount}
                weapons={weapons}
                abilities={abilities}
                rules={rules}
                highlightSelection={showOptions}
              />
            )
          }
          const row = entry.row
          const pieces = entry.pieces
          if (!pieces.length) return null
          const found = optionOf(row.choiceKey, row.optionId)
          if (!found) return null
          const { choice, option } = found
          const displayed = loadoutRowCount(row, choices)
          if (!showLoadoutEntry(displayed, showOptions)) return null
          const replacement = replacementChoice(row, model, choices, count)
          const sources = loadoutRowSources(row, choices)
          const addsModelRow = sources.some((source) => addsModel(model, source))
          const exceedsModelCount = sources.some(({ option: candidate }) => candidate.max > count)
          const direct = sources.filter(({ choice: source }) => source.room <= 1 && !source.carried)
          const replacesAnotherRow = Boolean(
            row.pieces?.some((piece) => model.rows.some((candidate) => candidate !== row && sameWeapon(candidate.name, piece))),
          )
          const addDirect = direct.find(
            ({ choice: source, option: candidate }) => source.chosen !== candidate.id && candidate.count < candidate.max,
          )
          const removeDirect = direct
            .map((source) => ({ source, replacement: choiceRemoval(source.choice, source.option, replacesAnotherRow) }))
            .find(({ replacement: candidate }) => candidate !== null)
          const add =
            displayed >= count && !addsModelRow && !exceedsModelCount
              ? undefined
              : replacement
                ? () => onChoose(replacement.key, '')
                : (press(spend(row)) ?? (addDirect ? () => onChoose(addDirect.choice.key, addDirect.option.id) : undefined))
          const remove =
            press(free(row)) ?? (removeDirect ? () => onChoose(removeDirect.source.choice.key, removeDirect.replacement ?? '') : undefined)
          const picked = choice.uniform || (choice.optional && choice.room === 1 && choice.options.length === 1)
          const instructions = showOptions
            ? loadoutInstructions({ ...row, pieces }, model, models ?? [model], wargearGroups ?? []).filter((instruction) => {
                if (statedInstructions.has(instruction)) return false
                statedInstructions.add(instruction)
                return true
              })
            : []
          return (
            <WargearRow
              key={`${row.choiceKey}/${row.optionId}/${entry.name}`}
              name={entry.name}
              pieces={pieces}
              count={displayed}
              points={option.points}
              weapons={weapons}
              abilities={abilities}
              rules={rules}
              highlightSelection={showOptions}
              instructions={instructions}
              control={
                picked ? (
                  <PickControl
                    name={entry.name}
                    count={displayed}
                    editable={editable}
                    disabled={controlsDisabled}
                    onPick={
                      option.count > 0
                        ? choice.optional
                          ? () => onSpread(choice.key, wholeSquadTakes(choice, ''))
                          : undefined
                        : () => onSpread(choice.key, wholeSquadTakes(choice, option.id))
                    }
                  />
                ) : (
                  <PoolStepper
                    name={entry.name}
                    count={displayed}
                    editable={editable}
                    disabled={controlsDisabled}
                    onAdd={add}
                    onRemove={remove}
                  />
                )
              }
            />
          )
        })}
      </ul>
    </section>
  )
}
