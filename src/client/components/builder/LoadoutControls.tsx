import { Check, Minus, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Toggle } from '@/components/ui/toggle'
import type { Datasheet } from '../../../server/catalogue'
import { RuleText } from '../RuleText'
import { WeaponProfile } from './DatasheetPanel'
import { type LoadoutChoice, type LoadoutOption, type SpreadCounts, spreadHandlers, weaponMatches, wargearMatches } from './loadoutModel'
import type { WeaponProfileData } from './loadoutModel'

/**
 * Rules prose inside the pane, at the size of the labels it sits between.
 *
 * A reference page is prose with headings; this is a control with a note attached, and
 * a note set larger than the option it explains reads as the louder of the two.
 */
const PROSE = 'text-xs'

/**
 * The controls the loadout pane is built from.
 *
 * Two kinds of choice, because the data holds two. A group with room for one is an
 * either-or — a captain's relic blade or his power sword — and reads as a choice. A
 * group with room for more is the squad dividing itself, eight blasters and two
 * carbines, which a single answer cannot say; that one gets a count against each
 * option. Nothing is typed either way: every option and every price is the data's.
 */

type Described = { abilities: Datasheet['abilities']; rules: Datasheet['keywordRules']; weapons: readonly WeaponProfileData[] }

/** A row's share of the bodies its kind of model has, given and taken one at a time. */
export function PoolStepper({
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
  return <Stepper label={name} count={count} onAdd={onAdd} onRemove={onRemove} countLabel={`${name} count`} />
}

/**
 * Taken or not, for a row the whole squad answers together.
 *
 * Every model carries the same one, so there is no number here to change: a count
 * control on a row like this invites a split the datasheet does not allow, and only
 * says so once the player has made one.
 */
export function PickControl({ name, count, editable, onPick }: { name: string; count: number; editable: boolean; onPick?: () => void }) {
  const taken = count > 0
  if (!editable) {
    return (
      <span className="chip readout" aria-label={`${name} count`}>
        {count}
      </span>
    )
  }
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <span className="readout text-sm tabular-nums" aria-label={`${name} count`}>
        {count}
      </span>
      <Toggle
        variant="outline"
        size="sm"
        aria-label={`${taken ? 'Remove' : 'Select'} ${name}`}
        pressed={taken}
        disabled={!editable || !onPick}
        onPressedChange={() => onPick?.()}
        className={`size-6 p-0 ${taken ? 'border-parchment bg-parchment/15 text-parchment' : 'border-edge-strong text-dim'}`}
      >
        <Check className="size-3.5" />
      </Toggle>
    </span>
  )
}

/**
 * Minus, the number, plus. The one shape a count is changed by anywhere in the pane,
 * so a squad's size and one option's share are pressed the same way.
 */
export function Stepper({
  label,
  count,
  countLabel,
  onAdd,
  onRemove,
}: {
  label: string
  count: number
  countLabel: string
  onAdd?: () => void
  onRemove?: () => void
}) {
  return (
    <span className="grid shrink-0 grid-cols-[1.5rem_2rem_1.5rem] items-center gap-1">
      <Button variant="outline" size="icon-sm" className="size-6" aria-label={`Fewer ${label}`} disabled={!onRemove} onClick={onRemove}>
        <Minus />
      </Button>
      <span className="readout text-center text-sm tabular-nums" aria-label={countLabel}>
        {count}
      </span>
      <Button variant="outline" size="icon-sm" className="size-6" aria-label={`More ${label}`} disabled={!onAdd} onClick={onAdd}>
        <Plus />
      </Button>
    </span>
  )
}

export function WargearRow({
  name,
  count,
  points,
  weapons,
  abilities,
  rules,
  control,
  note,
  highlightSelection = true,
}: Described & {
  name: string
  count: number
  points?: number
  control?: ReactNode
  note?: string
  highlightSelection?: boolean
}) {
  const matching = weapons
    .filter((weapon) => weaponMatches(name, weapon.name))
    .filter((weapon, at, all) => all.findIndex((candidate) => candidate.name === weapon.name) === at)
  return (
    <li className={count && highlightSelection ? 'bg-azure/5' : undefined}>
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold">{name}</span>
          {note ? <span className="block text-[0.6875rem] text-faint">{note}</span> : null}
          {points ? <span className="readout text-[0.6875rem] text-info">+{points} each</span> : null}
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

/** Waits for the complete loadout so its sections arrive together instead of in stages. */
export function LoadoutLoading() {
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
  highlightSelection = true,
  onSelect,
  children,
}: {
  option: LoadoutOption
  selected: boolean
  highlightSelection?: boolean
  onSelect?: () => void
  children: ReactNode
}) {
  return (
    <article
      className={`relative border ${selected && highlightSelection ? 'border-parchment bg-parchment/10' : `border-edge bg-card ${onSelect ? 'hover:border-dim' : ''}`}`}
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
            {option.points ? <span className="chip text-info">+{option.points} pts</span> : null}
            {selected && highlightSelection ? <Check className="size-3.5 text-parchment" aria-hidden /> : null}
          </span>
        </div>
        {children}
      </div>
    </article>
  )
}

/** Declining an optional group, which is itself one of the answers it offers. */
function DeclineButton({
  label,
  chosen,
  editable,
  onDecline,
}: {
  label: string
  chosen: boolean
  editable: boolean
  onDecline: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={!chosen}
      disabled={!editable}
      onClick={onDecline}
      className={`flex w-full items-center justify-between border px-2.5 py-2 text-left text-xs font-semibold uppercase ${
        chosen ? 'border-edge bg-card text-dim hover:border-dim hover:text-bone' : 'border-parchment bg-parchment/10 text-parchment'
      }`}
    >
      {label}
      {!chosen ? <Check className="size-3.5" aria-hidden /> : null}
    </button>
  )
}

/** An enhancement or a unit upgrade: a choice with prose rather than a weapon profile. */
export function SpecialChoice({
  choice,
  unitName,
  editable,
  onChoose,
  showOptions = true,
  highlightSelection = true,
}: {
  choice: LoadoutChoice
  unitName: string
  editable: boolean
  onChoose: (key: string, optionId: string) => void
  showOptions?: boolean
  highlightSelection?: boolean
}) {
  const heading = choice.kind === 'upgrade' ? 'Unit upgrades' : choice.name
  const options = showOptions ? choice.options : choice.options.filter((option) => choice.chosen === option.id)
  if (!showOptions && !choice.chosen) return null
  return (
    <fieldset aria-label={`${unitName} ${heading}`} className="m-0 min-w-0 border-0">
      <legend className="eyebrow mb-1.5">{heading}</legend>
      <div className="space-y-1.5">
        {choice.optional && showOptions ? (
          <DeclineButton
            label={`No ${choice.kind === 'upgrade' ? 'upgrade' : 'enhancement'}`}
            chosen={Boolean(choice.chosen)}
            editable={editable}
            onDecline={() => onChoose(choice.key, '')}
          />
        ) : null}
        {options.map((option) => (
          <ChoiceOption
            key={option.id}
            option={option}
            selected={choice.chosen === option.id}
            highlightSelection={highlightSelection}
            onSelect={editable ? () => onChoose(choice.key, option.id) : undefined}
          >
            {option.description ? (
              <div className="border-t border-edge px-2.5 pb-2">
                <RuleText text={option.description} rules={option.keywordRules} className={PROSE} />
              </div>
            ) : null}
          </ChoiceOption>
        ))}
      </div>
    </fieldset>
  )
}

/** A group that holds one thing: which one. */
export function EitherChoice({
  choice,
  unitName,
  editable,
  onChoose,
  weapons,
  abilities,
  rules,
  showOptions = true,
  highlightSelection = true,
}: Described & {
  choice: LoadoutChoice
  unitName: string
  editable: boolean
  onChoose: (key: string, optionId: string) => void
  showOptions?: boolean
  highlightSelection?: boolean
}) {
  const options = showOptions ? choice.options : choice.options.filter((option) => choice.chosen === option.id)
  return (
    <fieldset aria-label={`${unitName} ${choice.name}`} className="m-0 min-w-0 border-0 p-0">
      <legend className="eyebrow p-0">{choice.name}</legend>
      <div className="mt-1.5 space-y-1.5">
        {choice.optional && showOptions ? (
          <DeclineButton label="None" chosen={Boolean(choice.chosen)} editable={editable} onDecline={() => onChoose(choice.key, '')} />
        ) : null}
        {options.map((option) => (
          <ChoiceOption
            key={option.id}
            option={option}
            selected={choice.chosen === option.id}
            highlightSelection={highlightSelection}
            onSelect={editable ? () => onChoose(choice.key, option.id) : undefined}
          >
            <OptionProfiles optionName={option.name} weapons={weapons} rules={rules} />
            <OptionAbilities optionName={option.name} abilities={abilities} rules={rules} />
            {option.description ? (
              <div className="border-t border-edge px-2.5 pb-2">
                <RuleText text={option.description} rules={option.keywordRules ?? rules} className={PROSE} />
              </div>
            ) : null}
          </ChoiceOption>
        ))}
      </div>
    </fieldset>
  )
}

/** A group the squad divides between its options: a count against each. */
export function SpreadChoice({
  choice,
  editable,
  onSpread,
  weapons,
  abilities,
  rules,
  showOptions = true,
  highlightSelection = true,
}: Described & {
  choice: LoadoutChoice
  editable: boolean
  onSpread: (key: string, counts: SpreadCounts) => void
  showOptions?: boolean
  highlightSelection?: boolean
}) {
  const { taken, more, less } = spreadHandlers(choice)
  const press = (counts: SpreadCounts | null) => (counts ? () => onSpread(choice.key, counts) : undefined)

  return (
    <div>
      <p className="eyebrow flex items-baseline justify-between gap-2">
        <span>{choice.name}</span>
        <span className="readout normal-case">
          {taken}/{choice.room}
        </span>
      </p>
      <ul className="mt-1.5 space-y-1">
        {(showOptions ? choice.options : choice.options.filter((option) => option.count)).map((option) => (
          <li key={option.id} className={`border ${option.count && highlightSelection ? 'border-parchment bg-parchment/10' : 'border-edge bg-card'}`}>
            <div className="flex items-center gap-2 px-2 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold">{option.name}</span>
                {option.points ? <span className="readout text-[0.6875rem] text-info">+{option.points} each</span> : null}
              </span>
              <PoolStepper
                name={option.name}
                count={option.count}
                editable={editable}
                onAdd={press(more(option))}
                onRemove={press(less(option))}
              />
            </div>
            <OptionProfiles optionName={option.name} weapons={weapons} rules={rules} />
            <OptionAbilities optionName={option.name} abilities={abilities} rules={rules} />
          </li>
        ))}
      </ul>
    </div>
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
          {ability.description ? <RuleText text={ability.description} rules={rules} className={PROSE} /> : null}
        </div>
      ))}
    </div>
  ) : null
}

function OptionProfiles({
  optionName,
  weapons,
  rules,
}: {
  optionName: string
  weapons: readonly WeaponProfileData[]
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
