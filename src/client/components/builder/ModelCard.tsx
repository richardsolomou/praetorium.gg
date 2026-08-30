import type { Datasheet } from '../../../server/catalogue'
import {
  canAddPooledOption,
  changeBy,
  choiceRemoval,
  donorPriority,
  type LoadoutChoice,
  type LoadoutModel,
  type LoadoutOption,
  loadoutRowBand,
  loadoutRowCount,
  loadoutRowSources,
  ordered,
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

  const count = model.members.reduce(
    (total, member) => total + (member.choiceKey ? (optionOf(member.choiceKey, member.id)?.option.count ?? 0) : member.baseCount),
    0,
  )

  const sourcesOf = (row: LoadoutModel['rows'][number]) => loadoutRowSources(row, choices)
  const rowCount = (row: LoadoutModel['rows'][number]) => loadoutRowCount(row, choices)
  const bandOf = (row: LoadoutModel['rows'][number]) => loadoutRowBand(row, weapons)

  /**
   * Every weapon this kind of model counts by is one of its bodies holding that
   * weapon, so they all draw on the same pool however the catalogue files them.
   * Rebalancing within a single group would leave a veteran unable to put down a
   * pyrecannon and pick his bolt rifle back up, because the two are written in
   * different places.
   */
  const shared = model.rows.flatMap((row) =>
    sourcesOf(row).flatMap((found) => (found.choice.room > 1 || found.choice.carried ? [{ row, ...found }] : [])),
  )
  const move = (from: typeof shared, to: typeof shared) => {
    const wanted = new Map<string, Record<string, number>>()
    for (const [entry, delta] of [...from.map((one) => [one, -1] as const), ...to.map((one) => [one, 1] as const)]) {
      const counts = wanted.get(entry.choice.key) ?? {}
      counts[entry.option.id] = entry.option.count + delta
      wanted.set(entry.choice.key, counts)
    }
    return [...wanted]
  }
  const sameSource = (one: (typeof shared)[number], other: (typeof shared)[number]) =>
    one.choice.key === other.choice.key && one.option.id === other.option.id

  const spend = (taker: (typeof shared)[number]) => {
    // A group with no room left gives up one of its own: the veteran holding the
    // pyrecannon is the one who puts it down for a heavy bolter, and asking a
    // squadmate with a bolt rifle instead would put a second special weapon in a
    // squad allowed one.
    const kin = shared.filter((entry) => entry.choice.key === taker.choice.key)
    const full = kin.reduce((total, entry) => total + entry.option.count, 0) >= taker.choice.room
    const band = bandOf(taker.row)
    const pool = full ? kin : shared.filter((entry) => bandOf(entry.row) === band)
    const occupied = model.rows.filter((row) => bandOf(row) === band).reduce((total, row) => total + rowCount(row), 0)
    const giver = pool
      .filter((entry) => !sameSource(entry, taker) && entry.option.count > 0 && canAddPooledOption(taker.option, entry))
      .toSorted((one, other) => donorPriority(one.option, other.option))[0]
    if (!full && occupied < count) return canAddPooledOption(taker.option) ? move([], [taker]) : null
    if (giver) return move([giver], [taker])
    // A kind with nobody to ask can still be armed while its group has room: the
    // model is what joins the squad rather than something a body already there picks
    // up, and where it joins the squad's own ranks a squadmate gives up their place
    // for it. The Plague Marine holding the meltagun is one of the five.
    return !full && canAddPooledOption(taker.option) ? move([], [taker]) : null
  }

  const free = (giver: (typeof shared)[number]) => {
    if (giver.option.count <= 0) return null
    const taker = shared
      .filter((entry) => !sameSource(entry, giver) && canAddPooledOption(entry.option, giver))
      .toSorted((one, other) => donorPriority(one.option, other.option))[0]
    if (giver.option.count <= giver.option.min) return null
    return taker ? move([giver], [taker]) : move([giver], [])
  }

  /** The handler for a row's button, or nothing when that row cannot give or take. */
  const pooled = (row: LoadoutModel['rows'][number], decide: (entry: (typeof shared)[number]) => ReturnType<typeof move> | null) => {
    for (const entry of shared.filter((candidate) => candidate.row === row)) {
      const changes = decide(entry)
      if (changes) return () => changes.forEach(([key, counts]) => onSpread(key, counts))
    }
    return undefined
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

  return (
    <section className="border border-edge-strong bg-panel/40">
      <p className="eyebrow flex items-center justify-between gap-2 border-b border-edge px-2.5 py-2 text-bone">
        <span className="min-w-0">{model.name}</span>
        {stands && counted ? (
          <PoolStepper name={model.name} count={stands.option.count} editable={editable} disabled={controlsDisabled} {...counted} />
        ) : (
          <span className="readout normal-case text-dim" aria-label={`${model.name} models`}>
            {count}
          </span>
        )}
      </p>
      <ul className="divide-y divide-edge">
        {ordered(
          [...model.fixed.map((entry) => ({ name: entry.name, fixed: entry })), ...model.rows.map((row) => ({ name: row.name, row }))],
          weapons,
          (entry) => ('row' in entry ? `choice:${entry.row.choiceKey}` : `wargear:${entry.name}`),
        ).map((entry) => {
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
          const found = optionOf(row.choiceKey, row.optionId)
          if (!found) return null
          const { choice, option } = found
          const displayed = rowCount(row)
          if (!showLoadoutEntry(displayed, showOptions)) return null
          const replacement = replacementChoice(row, model, choices, count)
          const sources = sourcesOf(row)
          const addsModel = sources.some(({ choice: source, option: candidate }) =>
            model.members.some((member) => member.choiceKey === source.key && member.id === candidate.id),
          )
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
            displayed >= count && !addsModel && !exceedsModelCount
              ? undefined
              : replacement
                ? () => onChoose(replacement.key, '')
                : (pooled(row, spend) ?? (addDirect ? () => onChoose(addDirect.choice.key, addDirect.option.id) : undefined))
          const remove =
            pooled(row, free) ?? (removeDirect ? () => onChoose(removeDirect.source.choice.key, removeDirect.replacement ?? '') : undefined)
          const picked = choice.uniform || (choice.optional && choice.room === 1 && choice.options.length === 1)
          return (
            <WargearRow
              key={`${row.choiceKey}/${row.optionId}/${row.name}`}
              name={row.name}
              pieces={row.pieces}
              count={displayed}
              points={option.points}
              weapons={weapons}
              abilities={abilities}
              rules={rules}
              highlightSelection={showOptions}
              control={
                picked ? (
                  <PickControl
                    name={row.name}
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
                    name={row.name}
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
