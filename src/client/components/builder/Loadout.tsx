import { useQuery } from '@tanstack/react-query'
import { Check, Crown, Minus, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Toggle } from '@/components/ui/toggle'
import type { RosterPick } from '../../../core/roster'
import type { Datasheet } from '../../../server/catalogue'
import { datasheetQuery } from '../../queries'
import { RuleText } from '../RuleText'
import { WeaponProfile, WeaponSummary } from './DatasheetPanel'

type LoadoutChoice = {
  key: string
  name: string
  chosen: string
  optional: boolean
  carried: boolean
  room: number
  kind?: 'enhancement' | 'upgrade'
  options: {
    id: string
    name: string
    points: number
    count: number
    max: number
    description?: string | null
    keywordRules?: Datasheet['keywordRules']
  }[]
}

type LoadoutModel = {
  name: string
  fixed: { name: string; count?: number }[]
  members: { id: string; choiceKey: string | null; baseCount: number }[]
  rows: { name: string; choiceKey: string; optionId: string }[]
  /** Swaps the datasheet allows, one row per alternative, always listed. */
  swaps?: { key: string; gives: string[]; takes: string[]; count: number; max: number; free: boolean }[]
}

type LoadoutUnit = {
  entryId: string
  name: string
  points: number
  size: { min: number; max: number; models: number; resizable: boolean }
  toggles: { key: string; name: string; selected: boolean }[]
  choices: LoadoutChoice[]
  models: LoadoutModel[]
  /** Profiles for weapons the catalogue does not carry, from the source that names them. */
  modelWeapons?: Datasheet['profiles']
  /** Keyword rules for those weapons: they live in the game system, not the datasheet. */
  modelKeywordRules?: Datasheet['keywordRules']
  /** Rules for wargear that has no profile of its own, such as a shield. */
  modelAbilities?: Datasheet['abilities']
}

type Props = {
  catalogueId: string
  unit: LoadoutUnit | null
  detachmentIds: readonly string[]
  picks: readonly RosterPick[]
  pickIndex: number | null
  onChoose: (key: string, optionId: string) => void
  onSpread: (key: string, counts: Record<string, number>) => void
  onToggle: (key: string, name: string, selected: boolean) => void
  onResize: (models: number) => void
  /** How many models take a datasheet swap the catalogue does not describe. */
  onSwap: (key: string, count: number) => void
  editable?: boolean
}

/**
 * What the selected unit is carrying.
 *
 * Two kinds of choice, because the data holds two. A group with room for one is an
 * either-or — a captain's relic blade or his power sword — and reads as a choice. A
 * group with room for more is the squad dividing itself, eight blasters and two
 * carbines, which a single answer cannot say; that one gets a count against each
 * option. Nothing is typed either way: every option and every price is the data's.
 */
export function Loadout({
  catalogueId,
  unit,
  detachmentIds,
  picks,
  pickIndex,
  onChoose,
  onSpread,
  onToggle,
  onResize,
  onSwap,
  editable = true,
}: Props) {
  const [context, setContext] = useState({ detachmentIds, picks })
  useEffect(() => {
    const timeout = window.setTimeout(() => setContext({ detachmentIds, picks }), 150)
    return () => window.clearTimeout(timeout)
  }, [detachmentIds, picks])
  const { data: sheet } = useQuery({
    ...datasheetQuery(catalogueId, unit?.entryId ?? '', context.detachmentIds, context.picks, pickIndex),
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[2] === unit?.entryId ? previous : undefined),
  })
  // Every weapon the unit could take, priced and modified as this list would have
  // it: an enhancement that adds to a weapon's Attacks is part of the choice, so it
  // has to be visible before the choice is made rather than after.
  const { data: availableSheet } = useQuery({
    ...datasheetQuery(catalogueId, unit?.entryId ?? '', context.detachmentIds, context.picks, pickIndex, true),
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[2] === unit?.entryId ? previous : undefined),
  })

  if (!unit) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="max-w-52 text-center text-xs text-faint">Select a unit from the roster to see its loadout.</p>
      </div>
    )
  }
  if (!sheet || !availableSheet) return <LoadoutLoading />

  const ranged = sheet.profiles.filter((profile) => profile.type === 'Ranged Weapons')
  const melee = sheet.profiles.filter((profile) => profile.type === 'Melee Weapons')
  const catalogueWeapons = availableSheet.profiles.filter(
    (profile) => profile.type === 'Ranged Weapons' || profile.type === 'Melee Weapons',
  )
  const availableWeapons = [
    ...catalogueWeapons,
    // The rules source is only here to fill gaps. A weapon the catalogue already
    // names belongs to the catalogue, however either of them spells its profiles:
    // a staff of light the catalogue prints as two rows would otherwise appear
    // twice more as "Staff of light (Ranged)" and "Staff of light (Melee)".
    ...(unit.modelWeapons ?? []).filter((extra) => !catalogueWeapons.some((profile) => sameWeapon(profile.name, extra.name))),
  ]
  const choiceWeaponNames = unit.choices.flatMap((choice) => choice.options.map((option) => option.name))
  const fixedRanged = ranged.filter((profile) => !choiceWeaponNames.some((name) => weaponMatches(name, profile.name)))
  const fixedMelee = melee.filter((profile) => !choiceWeaponNames.some((name) => weaponMatches(name, profile.name)))
  const rules = [...availableSheet.keywordRules, ...(unit.modelKeywordRules ?? [])]
  const abilities = [...availableSheet.abilities, ...(unit.modelAbilities ?? [])]
  // Every choice a model of its own carries is drawn inside that model's card, so
  // what is left over belongs to the unit as a whole.
  const modelled = new Set(unit.models.flatMap((model) => model.rows.map((row) => row.choiceKey)))
  const looseChoices = unit.choices.filter((choice) => !modelled.has(choice.key))

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-edge p-2.5">
        <h2 className="text-sm leading-tight">{unit.name}</h2>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className="chip">{unit.points} pts</span>
          {unit.size.resizable && editable ? (
            <span className="grid grid-cols-[1.5rem_2rem_1.5rem] items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                className="size-6"
                aria-label={`Fewer models in ${unit.name}`}
                disabled={unit.size.models <= unit.size.min}
                onClick={() => onResize(unit.size.models - 1)}
              >
                <Minus />
              </Button>
              <span className="readout text-center text-sm tabular-nums" aria-label={`${unit.name} models`}>
                {unit.size.models}
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                className="size-6"
                aria-label={`More models in ${unit.name}`}
                disabled={unit.size.models >= unit.size.max}
                onClick={() => onResize(unit.size.models + 1)}
              >
                <Plus />
              </Button>
            </span>
          ) : unit.size.resizable ? (
            <span className="chip normal-case" aria-label={`${unit.name} models`}>
              {unit.size.models} models
            </span>
          ) : null}
          {unit.toggles.map((toggle) => (
            <Toggle
              key={toggle.key}
              variant="outline"
              size="sm"
              aria-label={`${toggle.selected ? 'Remove' : 'Make'} ${unit.name} ${toggle.name}`}
              pressed={toggle.selected}
              disabled={!editable}
              className={
                toggle.selected
                  ? 'border-azure bg-azure/15 text-azure hover:bg-azure/20 hover:text-azure'
                  : 'border-edge-strong text-dim hover:border-azure hover:text-bone'
              }
              onPressedChange={(pressed) => onToggle(toggle.key, toggle.name, pressed)}
            >
              <Crown className={toggle.selected ? 'fill-current' : undefined} />
              {toggle.name}
              {toggle.selected ? <Check className="size-3.5" aria-hidden /> : null}
            </Toggle>
          ))}
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]]:p-2.5">
        <div className="space-y-4">
          {unit.models.length ? (
            <div className="space-y-3">
              {unit.models.map((model) => (
                <ModelCard
                  key={model.name}
                  model={model}
                  choices={unit.choices}
                  weapons={availableWeapons}
                  abilities={abilities}
                  rules={rules}
                  onChoose={onChoose}
                  onSpread={onSpread}
                  onSwap={onSwap}
                  editable={editable}
                />
              ))}
            </div>
          ) : (
            <>
              {fixedRanged.length ? <WeaponSummary title="Equipped ranged weapons" weapons={fixedRanged} rules={rules} /> : null}
              {fixedMelee.length ? <WeaponSummary title="Equipped melee weapons" weapons={fixedMelee} rules={rules} /> : null}
            </>
          )}
          {looseChoices.length ? (
            <section>
              <p className="rubric flex items-baseline justify-between border-b border-edge pb-1.5">
                <span>Wargear options</span>
                <span className="readout">{looseChoices.length}</span>
              </p>
              <div className="mt-3 grid gap-5">
                {looseChoices.map((choice) =>
                  choice.kind
                    ? specialChoice(choice, onChoose, unit.name, editable)
                    : choice.room > 1
                      ? spread(choice, onSpread, availableWeapons, availableSheet.abilities, rules, editable)
                      : either(choice, onChoose, unit.name, availableWeapons, availableSheet.abilities, rules, editable),
                )}
              </div>
            </section>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}

/** Waits for the complete loadout so its sections arrive together instead of in stages. */
/**
 * One kind of model in the unit, and everything it can carry.
 *
 * A datasheet is read a model at a time — this is the sergeant, this is what he
 * holds — so the wargear a kind of model may take belongs under its own heading
 * rather than in one list the whole squad shares. The count comes from the choices
 * the rows already point at, never from a second copy of the same number.
 */
function ModelCard({
  model,
  choices,
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
  weapons: WeaponProfileData[]
  abilities: Datasheet['abilities']
  rules: Datasheet['keywordRules']
  onChoose: Props['onChoose']
  onSpread: Props['onSpread']
  onSwap: Props['onSwap']
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
    // A kind made only of carriers has no squadmate to ask, because the model is
    // what joins the squad rather than something a body already there picks up.
    return !full && taker.choice.carried ? move([], [taker]) : null
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

  return (
    <section className="border border-edge-strong bg-panel/40">
      <p className="eyebrow flex items-baseline justify-between gap-2 border-b border-edge px-2.5 py-2 text-bone">
        <span className="min-w-0">{model.name}</span>
        <span className="readout normal-case text-dim" aria-label={`${model.name} models`}>
          {count}
        </span>
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
              }
            />
          )
        })}
      </ul>
    </section>
  )
}

/**
 * Wargear in the order a datasheet prints it: everything shot with, then everything
 * swung with.
 *
 * Anything interchangeable travels together — the options of one group, and a swap
 * beside the weapon it replaces — so a choice is made without hunting up the card
 * for the thing to give up. A cluster takes its place from what it starts with, which
 * is why a combat knife sits with the bolt carbine it is traded for rather than down
 * among the melee weapons.
 */
function ordered<T extends { name: string }>(entries: readonly T[], weapons: WeaponProfileData[], clusterOf: (entry: T) => string) {
  const profiles = (name: string) => weapons.filter((weapon) => weaponMatches(name, weapon.name))
  // A combi-weapon has a melee profile and is still a gun, so what it also does
  // cannot decide where it goes.
  const melee = (name: string) =>
    profiles(name).some((weapon) => weapon.type === 'Melee Weapons') && !profiles(name).some((weapon) => weapon.type === 'Ranged Weapons')
  const clusters = new Map<string, { at: number; melee: boolean; entries: T[] }>()
  entries.forEach((entry, at) => {
    const key = clusterOf(entry)
    const cluster = clusters.get(key)
    if (cluster) cluster.entries.push(entry)
    else clusters.set(key, { at, melee: melee(entry.name), entries: [entry] })
  })
  return [...clusters.values()]
    .toSorted((one, other) => Number(one.melee) - Number(other.melee) || one.at - other.at)
    .flatMap((cluster) => cluster.entries)
}

function WargearRow({
  name,
  count,
  points,
  weapons,
  abilities,
  rules,
  control,
  note,
}: {
  name: string
  count: number
  points?: number
  weapons: WeaponProfileData[]
  abilities: Datasheet['abilities']
  rules: Datasheet['keywordRules']
  control?: ReactNode
  note?: string
}) {
  const matching = weapons
    .filter((weapon) => weaponMatches(name, weapon.name))
    .filter((weapon, at, all) => all.findIndex((candidate) => candidate.name === weapon.name) === at)
  return (
    <li className={count ? 'bg-azure/5' : undefined}>
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold">{name}</span>
          {note ? <span className="block text-[0.6875rem] text-faint">{note}</span> : null}
          {points ? <span className="readout text-[0.6875rem] text-faint">+{points} each</span> : null}
        </span>
        {control ?? (
          <span className="chip readout" aria-label={`${name} count`}>
            {count}
          </span>
        )}
      </div>
      {matching.map((weapon) => (
        <WeaponProfile key={weapon.id} weapon={weapon} rules={rules} showName={false} embedded />
      ))}
      <OptionAbilities optionName={name} abilities={abilities} rules={rules} />
    </li>
  )
}

function LoadoutLoading() {
  return (
    <output className="block h-full" aria-label="Loading loadout">
      <div className="space-y-2 border-b border-edge p-2.5">
        <span className="block h-4 w-32 animate-pulse bg-raised" />
        <div className="flex gap-2">
          <span className="h-6 w-14 animate-pulse bg-raised" />
          <span className="h-6 w-20 animate-pulse bg-raised" />
        </div>
      </div>
      <div className="space-y-4 p-2.5">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="space-y-2 border-t border-edge pt-2">
            <span className="block h-3 w-28 animate-pulse bg-raised" />
            <span className="block h-20 animate-pulse bg-card" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading loadout…</span>
    </output>
  )
}

function ChoiceOption({
  option,
  selected,
  onSelect,
  children,
}: {
  option: LoadoutChoice['options'][number]
  selected: boolean
  onSelect?: () => void
  children: ReactNode
}) {
  return (
    <article
      className={`relative border ${selected ? 'border-azure bg-azure/10' : `border-edge bg-card ${onSelect ? 'hover:border-dim' : ''}`}`}
    >
      {onSelect ? (
        <button
          type="button"
          aria-pressed={selected}
          aria-label={`Select ${option.name}`}
          onClick={onSelect}
          className="absolute inset-0 z-0 w-full cursor-pointer hover:bg-raised"
        />
      ) : null}
      <div className="pointer-events-none relative z-10 [&_button]:pointer-events-auto">
        <div className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left">
          <span className="text-sm font-semibold text-bone">{option.name}</span>
          <span className="flex shrink-0 items-center gap-1.5">
            {option.points ? <span className="chip">+{option.points} pts</span> : null}
            {selected ? <Check className="size-3.5 text-azure" aria-hidden /> : null}
          </span>
        </div>
        {children}
      </div>
    </article>
  )
}

function specialChoice(choice: LoadoutChoice, onChoose: Props['onChoose'], unitName: string, editable: boolean) {
  const label = choice.kind === 'upgrade' ? 'upgrade' : 'enhancement'
  const heading = choice.kind === 'upgrade' ? 'Unit upgrades' : choice.name
  return (
    <fieldset key={choice.key} aria-label={`${unitName} ${heading}`} className="m-0 min-w-0 border-0">
      <legend className="eyebrow mb-1.5">{heading}</legend>
      <div className="space-y-1.5">
        {choice.optional ? (
          <button
            type="button"
            aria-pressed={!choice.chosen}
            disabled={!editable}
            onClick={() => onChoose(choice.key, '')}
            className={`flex w-full items-center justify-between border px-2.5 py-2 text-left text-xs font-semibold uppercase ${
              choice.chosen ? 'border-edge bg-card text-dim hover:border-dim hover:text-bone' : 'border-azure bg-azure/10 text-azure'
            }`}
          >
            No {label}
            {!choice.chosen ? <Check className="size-3.5" aria-hidden /> : null}
          </button>
        ) : null}
        {choice.options.map((option) => {
          const selected = choice.chosen === option.id
          return (
            <ChoiceOption
              key={option.id}
              option={option}
              selected={selected}
              onSelect={editable ? () => onChoose(choice.key, option.id) : undefined}
            >
              {option.description ? (
                <div className="border-t border-edge px-2.5 pb-2">
                  <RuleText text={option.description} rules={option.keywordRules} />
                </div>
              ) : null}
            </ChoiceOption>
          )
        })}
      </div>
    </fieldset>
  )
}

/**
 * A group the squad divides between its options, a count at a time.
 *
 * The group is always full — every model carries something — so adding one of an
 * option takes one off whichever option has the most to give. That is what the
 * datasheet says in words: each model may replace its blaster with a carbine.
 */
function spreadHandlers(choice: LoadoutChoice) {
  const taken = choice.options.reduce((total, option) => total + option.count, 0)
  const room = choice.room - taken

  const donor = (exclude: string) =>
    choice.options.filter((option) => option.id !== exclude && option.count > 0).toSorted((left, right) => right.count - left.count)[0]

  const more = (option: LoadoutChoice['options'][number]) => {
    if (option.count >= option.max) return null
    if (room > 0) return { [option.id]: option.count + 1 }
    const giving = donor(option.id)
    return giving ? { [option.id]: option.count + 1, [giving.id]: giving.count - 1 } : null
  }

  const less = (option: LoadoutChoice['options'][number]) => {
    if (option.count <= 0) return null
    if (choice.optional || taken < choice.room) return { [option.id]: option.count - 1 }
    // A full group has to hand the freed slot to a sibling, and only one still
    // under its own cap can take it. Nine bolt rifles and a special weapon cannot
    // become ten bolt rifles.
    const receiving = choice.options
      .filter((candidate) => candidate.id !== option.id && candidate.count < candidate.max)
      .toSorted((left, right) => right.count - left.count)[0]
    return receiving ? { [option.id]: option.count - 1, [receiving.id]: receiving.count + 1 } : null
  }

  return { taken, more, less }
}

/** A row's share of the bodies its kind of model has, given and taken one at a time. */
function PoolStepper({
  name,
  count,
  editable,
  onAdd,
  onRemove,
}: {
  name: string
  count: number
  editable: boolean
  onAdd?: () => void
  onRemove?: () => void
}) {
  if (!editable) {
    return (
      <span className="chip readout" aria-label={`${name} count`}>
        {count}
      </span>
    )
  }
  return (
    <span className="grid shrink-0 grid-cols-[1.5rem_2rem_1.5rem] items-center gap-1">
      <Button variant="outline" size="icon-sm" className="size-6" aria-label={`Fewer ${name}`} disabled={!onRemove} onClick={onRemove}>
        <Minus />
      </Button>
      <span className="readout text-center text-sm tabular-nums" aria-label={`${name} count`}>
        {count}
      </span>
      <Button variant="outline" size="icon-sm" className="size-6" aria-label={`More ${name}`} disabled={!onAdd} onClick={onAdd}>
        <Plus />
      </Button>
    </span>
  )
}

function spread(
  choice: LoadoutChoice,
  onSpread: Props['onSpread'],
  weapons: WeaponProfileData[],
  abilities: Datasheet['abilities'],
  rules: Datasheet['keywordRules'],
  editable: boolean,
) {
  const handlers = spreadHandlers(choice)
  const { taken, more, less } = handlers

  return (
    <div key={choice.key}>
      <p className="eyebrow flex items-baseline justify-between gap-2">
        <span>{choice.name}</span>
        <span className="readout normal-case">
          {taken}/{choice.room}
        </span>
      </p>
      <ul className="mt-1.5 space-y-1">
        {choice.options.map((option) => (
          <li key={option.id} className={`border ${option.count ? 'border-azure bg-azure/10' : 'border-edge bg-card'}`}>
            <div className="flex items-center gap-2 px-2 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold">{option.name}</span>
                {option.points ? <span className="readout text-[0.6875rem] text-faint">+{option.points} each</span> : null}
              </span>
              {editable ? (
                <span className="grid shrink-0 grid-cols-[1.5rem_2rem_1.5rem] items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    className="size-6"
                    aria-label={`Fewer ${option.name}`}
                    disabled={!less(option)}
                    onClick={() => {
                      const next = less(option)
                      if (next) onSpread(choice.key, next)
                    }}
                  >
                    <Minus />
                  </Button>
                  <span className="readout text-center text-sm tabular-nums" aria-label={`${option.name} count`}>
                    {option.count}
                  </span>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    className="size-6"
                    aria-label={`More ${option.name}`}
                    disabled={!more(option)}
                    onClick={() => {
                      const next = more(option)
                      if (next) onSpread(choice.key, next)
                    }}
                  >
                    <Plus />
                  </Button>
                </span>
              ) : (
                <span className="chip readout" aria-label={`${option.name} count`}>
                  {option.count}
                </span>
              )}
            </div>
            <OptionProfiles optionName={option.name} weapons={weapons} rules={rules} />
            <OptionAbilities optionName={option.name} abilities={abilities} rules={rules} />
          </li>
        ))}
      </ul>
    </div>
  )
}

/** A group that holds one thing: which one. */
function either(
  choice: LoadoutChoice,
  onChoose: Props['onChoose'],
  unitName: string,
  weapons: WeaponProfileData[],
  abilities: Datasheet['abilities'],
  rules: Datasheet['keywordRules'],
  editable: boolean,
) {
  return (
    <fieldset key={choice.key} aria-label={`${unitName} ${choice.name}`} className="m-0 min-w-0 border-0 p-0">
      <legend className="eyebrow p-0">{choice.name}</legend>
      <div className="mt-1.5 space-y-1.5">
        {choice.optional ? (
          <button
            type="button"
            aria-pressed={!choice.chosen}
            disabled={!editable}
            onClick={() => onChoose(choice.key, '')}
            className={`flex w-full items-center justify-between border px-2.5 py-2 text-left text-xs font-semibold uppercase ${
              choice.chosen ? 'border-edge bg-card text-dim hover:border-dim hover:text-bone' : 'border-azure bg-azure/10 text-azure'
            }`}
          >
            None
            {!choice.chosen ? <Check className="size-3.5" aria-hidden /> : null}
          </button>
        ) : null}
        {choice.options.map((option) => {
          const selected = choice.chosen === option.id
          return (
            <ChoiceOption
              key={option.id}
              option={option}
              selected={selected}
              onSelect={editable ? () => onChoose(choice.key, option.id) : undefined}
            >
              <OptionProfiles optionName={option.name} weapons={weapons} rules={rules} />
              <OptionAbilities optionName={option.name} abilities={abilities} rules={rules} />
              {option.description ? (
                <div className="border-t border-edge px-2.5 pb-2">
                  <RuleText text={option.description} rules={option.keywordRules ?? rules} />
                </div>
              ) : null}
            </ChoiceOption>
          )
        })}
      </div>
    </fieldset>
  )
}

function OptionAbilities({
  optionName,
  abilities,
  rules,
}: {
  optionName: string
  abilities: Datasheet['abilities']
  rules: Datasheet['keywordRules']
}) {
  const matching = abilities.filter(
    (ability) => (ability.kind === 'datasheet' || ability.kind === 'wargear') && wargearMatches(optionName, ability.name),
  )
  return matching.length ? (
    <div data-slot="option-abilities" className="space-y-2 border-t border-edge px-2.5 pb-2">
      {matching.map((ability) => (
        <div key={ability.id}>
          {ability.name.toLocaleLowerCase() === optionName.toLocaleLowerCase() ? null : <p className="eyebrow pt-2">{ability.name}</p>}
          {ability.description ? <RuleText text={ability.description} rules={rules} /> : null}
        </div>
      ))}
    </div>
  ) : null
}

type WeaponProfileData = Datasheet['profiles'][number]

function OptionProfiles({
  optionName,
  weapons,
  rules,
}: {
  optionName: string
  weapons: WeaponProfileData[]
  rules: Datasheet['keywordRules']
}) {
  const matching = weapons.filter((weapon) => weaponMatches(optionName, weapon.name))
  return matching.length ? (
    <div className="border-t border-edge">
      {matching.map((weapon) => (
        <WeaponProfile key={weapon.id} weapon={weapon} rules={rules} showName={matching.length > 1} embedded />
      ))}
    </div>
  ) : null
}

/**
 * Whether two profile names are the same weapon, whichever of them names its
 * profiles: "Staff of light" and "Staff of light (Melee)" are one staff.
 */
function sameWeapon(one: string, other: string) {
  const base = (name: string) =>
    name
      .replace(/\s*\([^)]*\)\s*$/, '')
      .trim()
      .toLocaleLowerCase()
  return base(one) === base(other)
}

function weaponMatches(optionName: string, profileName: string) {
  const option = optionName.trim().toLocaleLowerCase()
  const profile = profileName.trim().toLocaleLowerCase()
  return profile === option || profile.startsWith(`${option} (`) || option.includes(profile)
}

function wargearMatches(optionName: string, abilityName: string) {
  const option = optionName.trim().toLocaleLowerCase()
  const ability = abilityName.trim().toLocaleLowerCase()
  return ability === option || ability.startsWith(`${option} (`) || option.includes(ability)
}
