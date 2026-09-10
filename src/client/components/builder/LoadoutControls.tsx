import { Minus, Plus } from 'lucide-react'
import { type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import type { Datasheet } from '../../../server/catalogue'
import { RuleText } from '../RuleText'
import { WeaponProfiles } from './DatasheetPanel'
import { weaponProfileGroups } from '../../datasheet'
import {
  defaultFirst,
  type LoadoutChoice,
  type LoadoutOption,
  type SpreadCounts,
  spreadHandlers,
  weaponProfilesFor,
  wargearMatches,
} from './loadoutModel'
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
  disabled = false,
  onAdd,
  onRemove,
}: {
  name: string
  count: number
  editable: boolean
  disabled?: boolean
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
    <Stepper
      label={name}
      count={count}
      onAdd={disabled ? undefined : onAdd}
      onRemove={disabled ? undefined : onRemove}
      countLabel={`${name} count`}
    />
  )
}

/**
 * Taken or not, for a row the whole squad answers together.
 *
 * Every model carries the same one, so there is no number here to change: a count
 * control on a row like this invites a split the datasheet does not allow, and only
 * says so once the player has made one.
 */
export function PickControl({
  name,
  count,
  editable,
  disabled = false,
  onPick,
}: {
  name: string
  count: number
  editable: boolean
  disabled?: boolean
  onPick?: () => void
}) {
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
      <CountButton label={`${taken ? 'Remove' : 'Select'} ${name}`} decrease={taken} onClick={disabled ? undefined : onPick} />
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
      <CountButton label={`Fewer ${label}`} decrease onClick={onRemove} />
      <span className="readout text-center text-sm tabular-nums" aria-label={countLabel}>
        {count}
      </span>
      <CountButton label={`More ${label}`} onClick={onAdd} />
    </span>
  )
}

function CountButton({ label, decrease = false, onClick }: { label: string; decrease?: boolean; onClick?: () => void }) {
  const color = decrease
    ? 'border-destructive/60 bg-destructive/15 text-destructive hover:bg-destructive/25 hover:text-destructive dark:border-destructive/60 dark:bg-destructive/15 dark:hover:bg-destructive/25'
    : 'border-primary/60 bg-primary/15 text-primary hover:bg-primary/25 hover:text-primary dark:border-primary/60 dark:bg-primary/15 dark:hover:bg-primary/25'
  return (
    <Button
      variant="outline"
      size="icon-sm"
      className={`size-6 ${onClick ? color : ''}`}
      aria-label={label}
      disabled={!onClick}
      onClick={onClick}
    >
      {decrease ? <Minus strokeWidth={2.5} /> : <Plus strokeWidth={2.5} />}
    </Button>
  )
}

export function WargearRow({
  name,
  pieces,
  count,
  points,
  weapons,
  abilities,
  rules,
  control,
  note,
  highlightSelection = true,
  instructions,
}: Described & {
  name: string
  pieces?: readonly string[]
  count: number
  points?: number
  control?: ReactNode
  note?: string
  highlightSelection?: boolean
  instructions?: readonly string[]
}) {
  const matching = weaponProfilesFor({ name, pieces }, weapons)
  const label = (
    <span className="min-w-0 flex-1">
      <span className="block text-[0.8125rem] font-semibold">{name}</span>
      {note ? <span className="block text-[0.6875rem] text-faint">{note}</span> : null}
      {points ? <span className="readout text-[0.6875rem] text-info">+{points} each</span> : null}
    </span>
  )
  return (
    <li className={`border border-l-[5px] bg-panel/40 ${count && highlightSelection ? 'border-azure/50 border-l-azure' : 'border-edge'}`}>
      {instructions?.map((instruction) => (
        <RuleText key={instruction} text={instruction} rules={rules} className="!mt-0 p-2.5 text-xs leading-[1.125rem]" />
      ))}
      <div className="flex items-center gap-2 px-2.5 py-1.5" data-equipped={count > 0}>
        {label}
        {control ?? (
          <span className="chip readout" aria-label={`${name} count`}>
            {count}
          </span>
        )}
      </div>
      <div>
        <WeaponProfiles weapons={matching} rules={rules} showName={weaponProfileGroups(matching).length > 1} showCount={false} embedded />
        <OptionAbilities option={{ name, pieces: pieces ? [...pieces] : undefined }} abilities={abilities} rules={rules} />
      </div>
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
  disabled = false,
  onSelect,
  children,
}: {
  option: LoadoutOption
  selected: boolean
  highlightSelection?: boolean
  disabled?: boolean
  onSelect?: () => void
  children: ReactNode
}) {
  return (
    <article
      className={`relative border border-l-[5px] bg-card ${selected && highlightSelection ? 'border-azure/50 border-l-azure' : 'border-edge'}`}
    >
      {onSelect ? (
        <button
          type="button"
          aria-pressed={selected}
          aria-label={`Select ${option.name}`}
          disabled={disabled}
          onClick={onSelect}
          className={`absolute inset-0 z-0 w-full ${disabled ? 'cursor-wait' : 'cursor-pointer hover:bg-raised'}`}
        />
      ) : null}
      <div className="pointer-events-none relative z-10 [&_button]:pointer-events-auto">
        <div className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left">
          <span className="min-w-0 flex-1 text-sm font-semibold text-bone">{option.name}</span>
          <span className="flex shrink-0 items-center gap-1.5">
            {option.points ? <span className="chip text-info">+{option.points} pts</span> : null}
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
  disabled = false,
  highlightSelection = true,
  onDecline,
}: {
  label: string
  chosen: boolean
  editable: boolean
  disabled?: boolean
  highlightSelection?: boolean
  onDecline: () => void
}) {
  const cursor = disabled ? 'cursor-wait' : editable ? 'hover:bg-raised' : 'cursor-not-allowed'
  return (
    <button
      type="button"
      aria-pressed={!chosen}
      disabled={!editable || disabled}
      onClick={onDecline}
      className={`w-full border border-l-[5px] bg-card px-2.5 py-2 text-left text-xs font-semibold uppercase text-bone ${cursor} ${
        !chosen && highlightSelection ? 'border-azure/50 border-l-azure' : 'border-edge'
      }`}
    >
      {label}
    </button>
  )
}

/** An enhancement or a unit upgrade: a choice with prose rather than a weapon profile. */
export function SpecialChoice({
  choice,
  unitName,
  editable,
  controlsDisabled = false,
  onChoose,
  showOptions = true,
  highlightSelection = true,
}: {
  choice: LoadoutChoice
  unitName: string
  editable: boolean
  controlsDisabled?: boolean
  onChoose: (key: string, optionId: string) => void
  showOptions?: boolean
  highlightSelection?: boolean
}) {
  const heading = choice.kind === 'upgrade' ? 'Unit upgrades' : choice.name
  const options = showOptions ? defaultFirst(choice.options) : choice.options.filter((option) => choice.chosen === option.id)
  if (!showOptions && !choice.chosen) return null
  return (
    <fieldset aria-label={`${unitName} ${heading}`} className="m-0 min-w-0 border-0">
      <legend className="eyebrow mb-1.5">{heading}</legend>
      <div className="space-y-1.5">
        {choice.optional && showOptions ? (
          <DeclineButton
            label={`No ${choice.kind === 'upgrade' ? 'upgrade' : 'enhancement'}`}
            chosen={Boolean(choice.chosen)}
            highlightSelection={highlightSelection}
            editable={editable}
            disabled={controlsDisabled}
            onDecline={() => onChoose(choice.key, '')}
          />
        ) : null}
        {options.map((option) => (
          <ChoiceOption
            key={option.id}
            option={option}
            selected={choice.chosen === option.id}
            highlightSelection={highlightSelection}
            disabled={controlsDisabled}
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
  controlsDisabled = false,
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
  controlsDisabled?: boolean
  onChoose: (key: string, optionId: string) => void
  showOptions?: boolean
  highlightSelection?: boolean
}) {
  const options = showOptions ? defaultFirst(choice.options) : choice.options.filter((option) => choice.chosen === option.id)
  return (
    <fieldset aria-label={`${unitName} ${choice.name}`} className="m-0 min-w-0 border-0 p-0">
      <legend className="eyebrow p-0">{choice.name}</legend>
      <div className="mt-1.5 space-y-1.5">
        {choice.optional && showOptions ? (
          <DeclineButton
            label="None"
            chosen={Boolean(choice.chosen)}
            highlightSelection={highlightSelection}
            editable={editable}
            disabled={controlsDisabled}
            onDecline={() => onChoose(choice.key, '')}
          />
        ) : null}
        {options.map((option) => (
          <ChoiceOption
            key={option.id}
            option={option}
            selected={choice.chosen === option.id}
            highlightSelection={highlightSelection}
            disabled={controlsDisabled}
            onSelect={editable ? () => onChoose(choice.key, option.id) : undefined}
          >
            <OptionProfiles option={option} weapons={weapons} rules={rules} />
            <OptionAbilities option={option} abilities={abilities} rules={rules} />
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
  controlsDisabled = false,
  onSpread,
  weapons,
  abilities,
  rules,
  showOptions = true,
  highlightSelection = true,
}: Described & {
  choice: LoadoutChoice
  editable: boolean
  controlsDisabled?: boolean
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
        {(showOptions ? defaultFirst(choice.options) : choice.options.filter((option) => option.count)).map((option) => (
          <li
            key={option.id}
            className={`border border-l-[5px] bg-card ${option.count && highlightSelection ? 'border-azure/50 border-l-azure' : 'border-edge'}`}
          >
            <div className="flex items-center gap-2 px-2 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold">{option.name}</span>
                {option.points ? <span className="readout text-[0.6875rem] text-info">+{option.points} each</span> : null}
              </span>
              <PoolStepper
                name={option.name}
                count={option.count}
                editable={editable}
                disabled={controlsDisabled}
                onAdd={press(more(option))}
                onRemove={press(less(option))}
              />
            </div>
            <OptionProfiles option={option} weapons={weapons} rules={rules} />
            <OptionAbilities option={option} abilities={abilities} rules={rules} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function OptionAbilities({
  option,
  abilities,
  rules,
}: {
  option: Pick<LoadoutOption, 'name' | 'pieces'>
  abilities: Datasheet['abilities']
  rules: Datasheet['keywordRules']
}) {
  const names = [option.name, ...(option.pieces ?? [])]
  const matching = abilities.filter(
    (ability) =>
      (ability.kind === 'datasheet' || ability.kind === 'upgrade' || ability.kind === 'wargear') &&
      names.some((name) => wargearMatches(name, ability.name)),
  )
  return matching.length ? (
    <div data-slot="option-abilities" className="space-y-2 border-t border-edge px-2.5 pb-2">
      {matching.map((ability) => (
        <div key={ability.id}>
          {ability.name.toLocaleLowerCase() === option.name.toLocaleLowerCase() ? null : <p className="eyebrow pt-2">{ability.name}</p>}
          {ability.description ? <RuleText text={ability.description} rules={rules} className={PROSE} /> : null}
        </div>
      ))}
    </div>
  ) : null
}

function OptionProfiles({
  option,
  weapons,
  rules,
}: {
  option: Pick<LoadoutOption, 'name' | 'pieces'>
  weapons: readonly WeaponProfileData[]
  rules: Datasheet['keywordRules']
}) {
  const matching = weaponProfilesFor(option, weapons)
  return matching.length ? (
    <div className="border-t border-edge">
      <WeaponProfiles weapons={matching} rules={rules} showName={weaponProfileGroups(matching).length > 1} showCount={false} embedded />
    </div>
  ) : null
}
