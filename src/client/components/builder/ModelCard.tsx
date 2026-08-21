import type { Datasheet } from '../../../server/catalogue'
import {
  changeBy,
  type LoadoutChoice,
  type LoadoutModel,
  type LoadoutOption,
  ordered,
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
  onSwap,
  editable,
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
  onSwap: (key: string, count: number) => void
  editable: boolean
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

  /**
   * Every weapon this kind of model counts by is one of its bodies holding that
   * weapon, so they all draw on the same pool however the catalogue files them.
   * Rebalancing within a single group would leave a veteran unable to put down a
   * pyrecannon and pick his bolt rifle back up, because the two are written in
   * different places.
   */
  const shared = model.rows.flatMap((row) => {
    const found = optionOf(row.choiceKey, row.optionId)
    return found && (found.choice.room > 1 || found.choice.carried) ? [{ row, ...found }] : []
  })
  const held = shared.reduce((total, entry) => total + entry.option.count, 0)

  const move = (from: typeof shared, to: typeof shared) => {
    const wanted = new Map<string, Record<string, number>>()
    for (const [entry, delta] of [...from.map((one) => [one, -1] as const), ...to.map((one) => [one, 1] as const)]) {
      const counts = wanted.get(entry.choice.key) ?? {}
      counts[entry.option.id] = entry.option.count + delta
      wanted.set(entry.choice.key, counts)
    }
    return [...wanted]
  }

  const spend = (taker: (typeof shared)[number]) => {
    if (taker.option.count >= taker.option.max) return null
    // A group with no room left gives up one of its own: the veteran holding the
    // pyrecannon is the one who puts it down for a heavy bolter, and asking a
    // squadmate with a bolt rifle instead would put a second special weapon in a
    // squad allowed one.
    const kin = shared.filter((entry) => entry.choice.key === taker.choice.key)
    const full = kin.reduce((total, entry) => total + entry.option.count, 0) >= taker.choice.room
    const pool = full ? kin : shared
    if (!full && held < count) return move([], [taker])
    const giver = pool
      .filter((entry) => entry !== taker && entry.option.count > 0)
      .toSorted((one, other) => other.option.count - one.option.count)[0]
    if (giver) return move([giver], [taker])
    // A kind with nobody to ask can still be armed while its group has room: the
    // model is what joins the squad rather than something a body already there picks
    // up, and where it joins the squad's own ranks a squadmate gives up their place
    // for it. The Plague Marine holding the meltagun is one of the five.
    return full ? null : move([], [taker])
  }

  const free = (giver: (typeof shared)[number]) => {
    if (giver.option.count <= 0) return null
    // The weapon being put down is what makes room for the one picked up, so while
    // the kind is full a squadmate counts as able to take it even though the
    // selection as it stands allows no more. Only the group's own capacity is a
    // ceiling: nine veterans with bolt rifles cannot become ten.
    const headroom = (entry: (typeof shared)[number]) => Math.max(entry.option.max, held >= count ? entry.choice.room : 0)
    const taker = shared
      .filter((entry) => entry !== giver && entry.option.count < headroom(entry))
      .toSorted((one, other) => other.option.count - one.option.count)[0]
    return taker ? move([giver], [taker]) : move([giver], [])
  }

  /** The handler for a row's button, or nothing when that row cannot give or take. */
  const pooled = (row: LoadoutModel['rows'][number], decide: (entry: (typeof shared)[number]) => ReturnType<typeof move> | null) => {
    const entry = shared.find((candidate) => candidate.row === row)
    const changes = entry ? decide(entry) : null
    return changes ? () => changes.forEach(([key, counts]) => onSpread(key, counts)) : undefined
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

  return (
    <section className="border border-edge-strong bg-panel/40">
      <p className="eyebrow flex items-center justify-between gap-2 border-b border-edge px-2.5 py-2 text-bone">
        <span className="min-w-0">{model.name}</span>
        {stands && counted ? (
          <PoolStepper name={model.name} count={stands.option.count} editable={editable} {...counted} />
        ) : (
          <span className="readout normal-case text-dim" aria-label={`${model.name} models`}>
            {count}
          </span>
        )}
      </p>
      <ul className="divide-y divide-edge">
        {ordered(
          [
            ...model.fixed.map((entry) => ({ name: entry.name, fixed: entry })),
            ...model.rows.map((row) => ({ name: row.name, row })),
            ...(model.swaps ?? []).map((swap) => ({ name: swap.takes.join(' and '), swap })),
          ],
          weapons,
          (entry) =>
            'row' in entry
              ? `choice:${entry.row.choiceKey}`
              : 'swap' in entry
                ? `wargear:${entry.swap.gives[0] ?? entry.swap.key}`
                : `wargear:${entry.name}`,
        ).map((entry) => {
          if ('fixed' in entry) {
            return (
              <WargearRow
                key={entry.name}
                name={entry.name}
                count={entry.fixed.count ?? count}
                weapons={weapons}
                abilities={abilities}
                rules={rules}
              />
            )
          }
          if ('swap' in entry) {
            const swap = entry.swap
            return (
              <WargearRow
                key={swap.key}
                name={entry.name}
                count={swap.count}
                weapons={weapons}
                abilities={abilities}
                rules={rules}
                note={swap.gives.length ? `instead of ${swap.gives.join(' and ')}` : undefined}
                control={
                  swap.free ? (
                    <PoolStepper
                      name={entry.name}
                      count={swap.count}
                      editable={editable}
                      onAdd={swap.count < swap.max ? () => onSwap(swap.key, swap.count + 1) : undefined}
                      onRemove={swap.count > 0 ? () => onSwap(swap.key, swap.count - 1) : undefined}
                    />
                  ) : (
                    <span className="w-[5.5rem] text-right text-[0.6875rem] text-faint">costs points</span>
                  )
                }
              />
            )
          }
          const row = entry.row
          const found = optionOf(row.choiceKey, row.optionId)
          if (!found) return null
          const { choice, option } = found
          const taken = choice.chosen === option.id
          return (
            <WargearRow
              key={`${row.choiceKey}/${row.optionId}`}
              name={row.name}
              count={option.count}
              points={option.points}
              weapons={weapons}
              abilities={abilities}
              rules={rules}
              control={
                choice.uniform ? (
                  // Every model carries the same one, so the row is answered rather
                  // than counted: taking it hands it to the whole squad at once.
                  <PickControl
                    name={row.name}
                    count={option.count}
                    editable={editable}
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
                    count={option.count}
                    editable={editable}
                    {...(choice.room > 1 || choice.carried
                      ? { onAdd: pooled(row, spend), onRemove: pooled(row, free) }
                      : {
                          onAdd: taken ? undefined : () => onChoose(choice.key, option.id),
                          // A group that must hold something cannot be emptied, only
                          // pointed elsewhere, so offering to empty it would lie.
                          onRemove: taken && choice.optional ? () => onChoose(choice.key, '') : undefined,
                        })}
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
