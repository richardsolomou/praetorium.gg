import { useQuery } from '@tanstack/react-query'
import { Check, Crown } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Toggle } from '@/components/ui/toggle'
import type { RosterPick } from '../../../core/roster'
import { datasheetQuery } from '../../queries'
import { useSettled } from '../../useSettled'
import { WeaponSummary } from './DatasheetPanel'
import {
  type LoadoutModel,
  type LoadoutUnit,
  orderedChoices,
  sameWeapon,
  type SpreadCounts,
  weaponMatches,
  wholeSquadTakes,
} from './loadoutModel'
import { EitherChoice, LoadoutLoading, SpecialChoice, SpreadChoice, Stepper } from './LoadoutControls'
import { ModelCard } from './ModelCard'

type Props = {
  catalogueId: string
  unit: LoadoutUnit | null
  detachmentIds: readonly string[]
  picks: readonly RosterPick[]
  pickIndex: number | null
  onChoose: (key: string, optionId: string) => void
  onSpread: (key: string, counts: SpreadCounts) => void
  onToggle: (key: string, name: string, selected: boolean) => void
  onResize: (models: number) => void
  /** How many models take a datasheet swap the catalogue does not describe. */
  onSwap: (key: string, count: number) => void
  editable?: boolean
}

/**
 * What the selected unit is carrying.
 *
 * A card per kind of model, the way a datasheet reads, and below them whatever the
 * unit chooses as a whole. Deciding which of the two a choice belongs to is this
 * file's only real work — the controls themselves live in `LoadoutControls.tsx` and
 * the reasoning behind them in `loadoutModel.ts`.
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
  // Only once the player stops changing the list, so a held stepper asks once.
  const detachments = useSettled(detachmentIds)
  const settledPicks = useSettled(picks)

  // A pane that swapped units keeps nothing from the last one; one that only had a
  // count changed keeps what it was showing, so the profiles do not blink.
  const forSameUnit = (previousQuery?: { queryKey: readonly unknown[] }) => previousQuery?.queryKey[2] === unit?.entryId
  const { data: sheet } = useQuery({
    ...datasheetQuery(catalogueId, unit?.entryId ?? '', detachments, settledPicks, pickIndex),
    placeholderData: (previous, previousQuery) => (forSameUnit(previousQuery) ? previous : undefined),
  })
  // Every weapon the unit could take, priced and modified as this list would have
  // it: an enhancement that adds to a weapon's Attacks is part of the choice, so it
  // has to be visible before the choice is made rather than after.
  const { data: availableSheet } = useQuery({
    ...datasheetQuery(catalogueId, unit?.entryId ?? '', detachments, settledPicks, pickIndex, true),
    placeholderData: (previous, previousQuery) => (forSameUnit(previousQuery) ? previous : undefined),
  })

  if (!unit) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="max-w-52 text-center text-xs text-faint">Select a unit from the roster to see its loadout.</p>
      </div>
    )
  }
  if (!sheet || !availableSheet) return <LoadoutLoading />

  const catalogueWeapons = availableSheet.profiles.filter(
    (profile) => profile.type === 'Ranged Weapons' || profile.type === 'Melee Weapons',
  )
  const weapons = [
    ...catalogueWeapons,
    // The rules source is only here to fill gaps. A weapon the catalogue already
    // names belongs to the catalogue, however either of them spells its profiles:
    // a staff of light the catalogue prints as two rows would otherwise appear
    // twice more as "Staff of light (Ranged)" and "Staff of light (Melee)".
    ...(unit.modelWeapons ?? []).filter((extra) => !catalogueWeapons.some((profile) => sameWeapon(profile.name, extra.name))),
  ]
  const rules = [...availableSheet.keywordRules, ...(unit.modelKeywordRules ?? [])]
  const abilities = [...availableSheet.abilities, ...(unit.modelAbilities ?? [])]

  // Weapons a unit with no model cards is simply carrying, as a summary rather than
  // a set of controls: nothing about them is the player's to change.
  const chosenNames = unit.choices.flatMap((choice) => choice.options.map((option) => option.name))
  const equipped = (type: string) =>
    sheet.profiles.filter((profile) => profile.type === type && !chosenNames.some((name) => weaponMatches(name, profile.name)))
  const equippedRanged = equipped('Ranged Weapons')
  const equippedMelee = equipped('Melee Weapons')

  const { models, loose } = divide(unit)
  const described = { weapons, abilities, rules }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-edge p-2.5">
        <h2 className="text-sm leading-tight">{unit.name}</h2>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className="chip">{unit.points} pts</span>
          {unit.size.resizable && editable ? (
            <Stepper
              label={`models in ${unit.name}`}
              countLabel={`${unit.name} models`}
              count={unit.size.models}
              onRemove={unit.size.models > unit.size.min ? () => onResize(unit.size.models - 1) : undefined}
              onAdd={unit.size.models < unit.size.max ? () => onResize(unit.size.models + 1) : undefined}
            />
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
                  // A datasheet can name two kinds of model the same, so what tells
                  // the cards apart is the models they hold rather than the heading.
                  key={model.members.map((member) => member.id).join('/')}
                  model={model}
                  choices={unit.choices}
                  stands={models.get(model) ?? null}
                  onChoose={onChoose}
                  onSpread={onSpread}
                  onSwap={onSwap}
                  editable={editable}
                  {...described}
                />
              ))}
            </div>
          ) : (
            <>
              {equippedRanged.length ? <WeaponSummary title="Equipped ranged weapons" weapons={equippedRanged} rules={rules} /> : null}
              {equippedMelee.length ? <WeaponSummary title="Equipped melee weapons" weapons={equippedMelee} rules={rules} /> : null}
            </>
          )}
          {loose.length ? (
            <section>
              <p className="rubric flex items-baseline justify-between border-b border-edge pb-1.5">
                <span>Wargear options</span>
                <span className="readout">{loose.length}</span>
              </p>
              <div className="mt-3 grid gap-5">
                {orderedChoices(loose, weapons).map((choice) =>
                  choice.kind ? (
                    <SpecialChoice key={choice.key} choice={choice} unitName={unit.name} editable={editable} onChoose={onChoose} />
                  ) : choice.room > 1 && !choice.uniform ? (
                    <SpreadChoice
                      key={choice.key}
                      choice={choice}
                      editable={editable}
                      onSpread={onSpread}
                      weapons={weapons}
                      abilities={availableSheet.abilities}
                      rules={rules}
                    />
                  ) : (
                    <EitherChoice
                      key={choice.key}
                      choice={choice}
                      unitName={unit.name}
                      editable={editable}
                      // A squad that must match answers once, and every model follows.
                      onChoose={choice.uniform ? (key, optionId) => onSpread(key, wholeSquadTakes(choice, optionId)) : onChoose}
                      weapons={weapons}
                      abilities={availableSheet.abilities}
                      rules={rules}
                    />
                  ),
                )}
              </div>
            </section>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}

type Stood = { choice: LoadoutUnit['choices'][number]; option: LoadoutUnit['choices'][number]['options'][number] }

/**
 * Which choices belong to a model's own card, and which to the unit as a whole.
 *
 * Every choice a model carries is drawn inside that model's card, so what is left
 * over belongs to the unit — and a group whose every option is a card of its own is
 * answered by those cards rather than asked again below them. One question, one
 * control, whichever of the two places it ends up in.
 */
function divide(unit: LoadoutUnit): { models: Map<LoadoutModel, Stood>; loose: LoadoutUnit['choices'] } {
  /**
   * The option a card stands for, where the card is the whole of it.
   *
   * A loadout that pairs two weapons cannot be drawn as a row for each — the pairing
   * is what the catalogue sells — so it keeps a card of its own, and the card is then
   * the only honest place to ask how many of it the squad has. Its heading takes the
   * count, rather than the card saying one thing and a wargear option below it another.
   */
  const standingFor = (model: LoadoutModel): Stood | null => {
    const [member, ...rest] = model.members
    if (!member || rest.length || !member.choiceKey) return null
    if (model.rows.some((row) => row.optionId === member.id)) return null
    const choice = unit.choices.find((candidate) => candidate.key === member.choiceKey && !candidate.kind)
    const option = choice?.options.find((candidate) => candidate.id === member.id)
    return choice && option ? { choice, option } : null
  }

  const stood = new Map(unit.models.flatMap((model) => (standingFor(model) ? [[model, standingFor(model)!] as const] : [])))
  const modelled = new Set(unit.models.flatMap((model) => model.rows.map((row) => row.choiceKey)))
  const carded = new Set([...stood.values()].map((found) => found.option.id))
  const loose = unit.choices.filter((choice) => !modelled.has(choice.key) && !choice.options.every((option) => carded.has(option.id)))

  // A card only counts its own option where the group is not drawn below as well.
  const models = new Map([...stood].filter(([, found]) => !loose.includes(found.choice)))
  return { models, loose }
}
