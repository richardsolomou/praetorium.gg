import type { Datasheet } from '../../../../contracts/catalogue'
import {
  addsModel,
  changeBy,
  choiceRemoval,
  findOption,
  increaseBlocked,
  loadoutFixedCount,
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
  poolChangeUpdates,
  pressedCounts,
  replacementChoice,
  showLoadoutEntry,
  type SpreadCounts,
  type SpreadUpdate,
  spreadHandlers,
  wholeSquadTakes,
} from './loadoutModel'
import type { WeaponProfileData } from './loadoutModel'
import { type OptionNote, PickControl, PoolStepper, type StandingWargear, WargearRow } from './LoadoutControls'
import { unitOption } from '../../../components/UnitFromVsData'
import { blocksText } from '../../../components/RuleSummaryText'
import type { VsDataUnit } from '../../../../shared/vsData'
import { sameWargear } from '../../../../core/wargearNames'

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
  unitOptions,
  models,
  onChoose,
  onSpread,
  editable,
  controlsDisabled = false,
  showOptions = true,
  optionNote,
  saved,
  standing,
}: {
  model: LoadoutModel
  choices: LoadoutChoice[]
  /** The choice option this card is the whole of, when its heading is where it is counted. */
  stands: { choice: LoadoutChoice; option: LoadoutOption } | null
  weapons: WeaponProfileData[]
  abilities: Datasheet['abilities']
  rules: Datasheet['keywordRules']
  /** The unit's wargear options as VS Data writes them, whose wording each row they offer shows above it. */
  unitOptions?: VsDataUnit['options']
  models?: readonly LoadoutModel[]
  onChoose: (key: string, optionId: string) => void
  onSpread: (key: string, update: SpreadUpdate) => void
  editable: boolean
  controlsDisabled?: boolean
  showOptions?: boolean
  optionNote?: OptionNote
  /** The pick's saved counts, which every press folds against. */
  saved?: Record<string, SpreadCounts>
  standing?: StandingWargear
}) {
  const count = modelCount(model, choices)
  const { spend, free } = poolHandlers(model, choices, weapons)
  const press = (changes: PoolChange | null) => {
    const updates = changes ? poolChangeUpdates(changes, choices) : []
    const lands = updates.every(([key, update]) =>
      update(pressedCounts(choices.find((choice) => choice.key === key) ?? { options: [] }, saved?.[key])),
    )
    return updates.length && lands ? () => updates.forEach(([key, update]) => onSpread(key, update)) : undefined
  }

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
      const handlers = spreadHandlers(choice, saved?.[choice.key])
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
        <span className="min-w-0">
          {model.name}
          {stands ? optionNote?.(stands.choice.key, stands.option.id) : null}
        </span>
        {stands && counted ? (
          <PoolStepper
            name={model.name}
            count={stands.option.count}
            editable={editable}
            disabled={controlsDisabled}
            blocked={increaseBlocked(stands.choice, stands.option)}
            {...counted}
          />
        ) : (
          <span className="readout normal-case text-dim" aria-label={`${model.name} models`}>
            {count}
          </span>
        )}
      </p>
      <ul className="space-y-3">
        {orderedModelWargear(model, choices, weapons).map((entry) => {
          if ('fixed' in entry) {
            const fixedCount = loadoutFixedCount(model, entry.fixed, choices)
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
                standing={standing}
              />
            )
          }
          const row = entry.row
          const pieces = entry.pieces
          if (!pieces.length) return null
          const found = findOption(choices, row.choiceKey, row.optionId)
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
            row.pieces?.some((piece) => model.rows.some((candidate) => candidate !== row && sameWargear(candidate.name, piece))),
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
          const picked = choice.uniform || option.wholeSquad || (choice.optional && choice.room === 1 && choice.options.length === 1)
          const putDown = choice.optional ? '' : option.wholeSquad ? choice.options.find((candidate) => candidate.default)?.id : undefined
          // Putting down an option the whole squad took hands every model back its ordinary
          // loadout, a sergeant who took the same wargear beside them included.
          const putDownAll = (back: string) => {
            onSpread(choice.key, () => wholeSquadTakes(choice, back))
            if (!option.wholeSquad) return
            for (const other of choices) {
              const held = other.options.find((candidate) => candidate.id === other.chosen && candidate.count > 0)
              const ordinary = other.options.find((candidate) => candidate.default)
              if (other !== choice && held && ordinary && pieces.some((piece) => sameWargear(piece, held.name)))
                onChoose(other.key, ordinary.id)
            }
          }
          const instructions = showOptions
            ? loadoutInstructions({ ...row, pieces }, model, models ?? [model], unitOptions ?? [])
                .map(unitOption)
                .filter((instruction) => {
                  if (statedInstructions.has(blocksText(instruction))) return false
                  statedInstructions.add(blocksText(instruction))
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
              standing={standing}
              annotation={optionNote?.(row.choiceKey, row.optionId)}
              control={
                picked ? (
                  <PickControl
                    name={entry.name}
                    count={displayed}
                    editable={editable}
                    disabled={controlsDisabled}
                    onPick={
                      option.count > 0
                        ? putDown !== undefined
                          ? () => putDownAll(putDown)
                          : undefined
                        : () => onSpread(choice.key, () => wholeSquadTakes(choice, option.id))
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
                    blocked={sources.map((source) => increaseBlocked(source.choice, source.option)).find(Boolean)}
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
