import type { ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import type { Datasheet } from '../../../../contracts/catalogue'
import { RuleText, SummaryByName } from '../../../components/RuleText'
import { DatasheetUnit } from '../../../components/UnitFromVsData'
import { Blocks, blocksText } from '../../../components/RuleSummaryText'
import type { RuleSummaryBlock } from '../../../../contracts/rules'
import { CountButton, Stepper } from '../../../components/Stepper'
import { WeaponProfiles } from '../../../components/DatasheetProfiles'
import { weaponProfileGroups } from '../../../datasheet'
import {
  changeBy,
  defaultFirst,
  increaseBlocked,
  type LoadoutChoice,
  type LoadoutOption,
  type SpreadCounts,
  type SpreadUpdate,
  spreadHandlers,
  rowCarries,
  weaponProfilesFor,
  weaponProfileNames,
  weaponPieceMatches,
  optionNameMatches,
} from './loadoutModel'
import type { WeaponProfileData } from './loadoutModel'
import { ReminderButton, type ReminderControls } from '../ReminderButton'

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

/** A loadout answer is a moulded well; the one taken carries a cement hairline. */
const OPTION = 'overflow-hidden rounded-lg border bg-card'
const PICKED = 'border-parchment inset-ring-1 inset-ring-parchment'

/**
 * A row's share of the bodies its kind of model has, given and taken one at a time.
 */
export function PoolStepper({
  name,
  count,
  editable,
  disabled = false,
  onAdd,
  onRemove,
  blocked,
}: {
  name: string
  count: number
  editable: boolean
  disabled?: boolean
  onAdd?: () => void
  onRemove?: () => void
  blocked?: string | null
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
      blocked={disabled ? null : blocked}
      reasonBeside
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

/** Something to say beside one option of one choice; the roster builder says nothing. */
export type OptionNote = (choiceKey: string, optionId: string) => ReactNode

export function WargearRow({
  name,
  pieces,
  count,
  points,
  weapons,
  abilities,
  rules,
  control,
  annotation,
  highlightSelection = true,
  instructions,
  standing,
}: Described & {
  name: string
  pieces?: readonly string[]
  count: number
  points?: number
  control?: ReactNode
  annotation?: ReactNode
  highlightSelection?: boolean
  /** What the options this row comes from allow, in Praetorium's words. */
  instructions?: readonly RuleSummaryBlock[][]
  standing?: StandingWargear
}) {
  const matching = weaponProfilesFor({ name, pieces }, weapons)
  const carries = (piece: string) => rowCarries({ name, pieces }, piece)
  const fallen = standing?.fallen(carries)
  const label = (
    <span className="min-w-0 flex-1">
      <span className={`block text-sm font-semibold ${fallen ? 'line-through' : ''}`}>{name}</span>
      {points ? <span className="readout text-2xs text-info">+{points} each</span> : null}
      {annotation}
    </span>
  )
  return (
    <li
      aria-label={name}
      data-fallen={fallen || undefined}
      data-sought={standing?.sought(carries) || undefined}
      className={`${OPTION} scroll-mt-2.5 print:break-inside-avoid ${count && highlightSelection ? PICKED : 'border-edge'} ${fallen ? 'opacity-50' : ''}`}
    >
      {instructions?.map((instruction) => (
        <div
          key={blocksText(instruction)}
          data-option-instruction
          className="space-y-0.5 p-2.5 font-rules text-xs leading-[1.125rem] text-dim"
        >
          <Blocks blocks={instruction} />
        </div>
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

/** What a battle knows of a unit's models, asked of each row through whether the row carries a named piece. */
export type StandingWargear = {
  /** Whether a piece the row carries is held by no model still standing. */
  fallen: (carries: (piece: string) => boolean) => boolean
  /** Whether the row carries what tells apart the models a player asked to see. */
  sought: (carries: (piece: string) => boolean) => boolean
  /** How many of a piece the row carries the models still standing hold, where the battle knows who holds it. */
  left: (carries: (piece: string) => boolean) => number | undefined
}

/** Waits for the complete loadout so its sections arrive together instead of in stages. */
export function LoadoutLoading() {
  return (
    <output className="block h-full" aria-label="Loading loadout">
      <div className="space-y-2 border-b border-edge p-2.5">
        <Skeleton className="h-4 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-14" />
          <Skeleton className="h-6 w-20" />
        </div>
      </div>
      <div className="space-y-4 p-2.5">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="space-y-2 border-t border-edge pt-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-20" />
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
  action,
  annotation,
  children,
}: {
  option: LoadoutOption
  selected: boolean
  highlightSelection?: boolean
  disabled?: boolean
  onSelect?: () => void
  action?: ReactNode
  annotation?: ReactNode
  children: ReactNode
}) {
  return (
    <article className={`relative ${OPTION} ${selected && highlightSelection ? PICKED : 'border-edge'}`}>
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
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-bone">{option.name}</span>
            {annotation}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {option.points ? <span className="chip text-info">+{option.points} pts</span> : null}
            {action}
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
  onDecline,
}: {
  label: string
  chosen: boolean
  editable: boolean
  disabled?: boolean
  onDecline: () => void
}) {
  const cursor = disabled ? 'cursor-wait' : editable ? 'hover:bg-raised' : 'cursor-not-allowed'
  return (
    <button
      type="button"
      aria-pressed={!chosen}
      disabled={!editable || disabled}
      onClick={onDecline}
      className={`w-full ${OPTION} px-2.5 py-2 text-left text-xs font-semibold uppercase text-bone ${cursor} ${
        !chosen ? PICKED : 'border-edge'
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
  reminders,
  detachmentRuleOwners,
}: {
  choice: LoadoutChoice
  unitName: string
  editable: boolean
  controlsDisabled?: boolean
  onChoose: (key: string, optionId: string) => void
  showOptions?: boolean
  reminders?: ReminderControls
  /** Whose rules each detachment's are, by detachment id, as `detachmentRuleOwners` names them. */
  detachmentRuleOwners?: Readonly<Record<string, string>>
}) {
  const heading = choice.kind === 'upgrade' ? 'Unit upgrades' : choice.name
  const options = showOptions ? defaultFirst(choice.options) : choice.options.filter((option) => choice.chosen === option.id)
  const subject = (option: LoadoutOption) => ({
    id: option.id,
    kind: choice.kind ?? 'upgrade',
    name: option.name,
    description: option.description,
    ...(option.reminder ? { reminder: option.reminder } : {}),
  })
  const choose = (optionId: string) => onChoose(choice.key, optionId)
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
            disabled={controlsDisabled}
            onDecline={() => choose('')}
          />
        ) : null}
        {options.map((option) => {
          // An enhancement reads as its detachment's, by name, as that detachment's page shows it; else by its text alone.
          const owner = option.detachment && detachmentRuleOwners?.[option.detachment]
          const text = option.description ? (
            <RuleText text={option.description} rules={option.keywordRules} className={PROSE} {...(owner ? { name: option.name } : {})} />
          ) : owner ? (
            <SummaryByName name={option.name} className={PROSE} />
          ) : null
          return (
            <ChoiceOption
              key={option.id}
              option={option}
              selected={choice.chosen === option.id}
              highlightSelection={showOptions}
              disabled={controlsDisabled}
              onSelect={editable ? () => choose(option.id) : undefined}
              action={
                reminders && choice.chosen === option.id ? <ReminderButton subject={subject(option)} controls={reminders} /> : undefined
              }
            >
              {text ? (
                <div className="border-t border-edge px-2.5 pb-2">
                  {owner ? <DatasheetUnit.Provider value={owner}>{text}</DatasheetUnit.Provider> : text}
                </div>
              ) : null}
            </ChoiceOption>
          )
        })}
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
  optionNote,
}: Described & {
  choice: LoadoutChoice
  unitName: string
  editable: boolean
  controlsDisabled?: boolean
  onChoose: (key: string, optionId: string) => void
  showOptions?: boolean
  optionNote?: OptionNote
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
            highlightSelection={showOptions}
            disabled={controlsDisabled}
            onSelect={editable ? () => onChoose(choice.key, option.id) : undefined}
            annotation={optionNote?.(choice.key, option.id)}
          >
            <OptionProfiles option={option} weapons={weapons} rules={rules} showCount={Boolean(option.pieceCounts?.length)} />
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
  optionNote,
  saved,
}: Described & {
  choice: LoadoutChoice
  editable: boolean
  controlsDisabled?: boolean
  onSpread: (key: string, update: SpreadUpdate) => void
  showOptions?: boolean
  optionNote?: OptionNote
  saved?: SpreadCounts
}) {
  const { taken, more, less } = spreadHandlers(choice, saved)

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
          <li key={option.id} className={`${OPTION} ${option.count && showOptions ? PICKED : 'border-edge'}`}>
            <div className="flex items-center gap-2 px-2 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold">{option.name}</span>
                {option.points ? <span className="readout text-2xs text-info">+{option.points} each</span> : null}
                {optionNote?.(choice.key, option.id)}
              </span>
              <PoolStepper
                name={option.name}
                count={option.count}
                editable={editable}
                disabled={controlsDisabled}
                onAdd={changeBy(more(option), choice.key, onSpread)}
                onRemove={changeBy(less(option), choice.key, onSpread)}
                blocked={increaseBlocked(choice, option)}
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
      names.some((name) => optionNameMatches(name, ability.name)),
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
  showCount = false,
}: {
  option: Pick<LoadoutOption, 'name' | 'pieces' | 'pieceCounts'>
  weapons: readonly WeaponProfileData[]
  rules: Datasheet['keywordRules']
  showCount?: boolean
}) {
  const matching = weaponProfilesFor(option, weapons)
  const counted = showCount
    ? matching.map((profile) => ({
        ...profile,
        count: option.pieceCounts?.find((piece) => weaponProfileNames(profile).some((name) => weaponPieceMatches(piece.name, name)))?.count,
      }))
    : matching
  return matching.length ? (
    <div className="border-t border-edge">
      <WeaponProfiles weapons={counted} rules={rules} showName={weaponProfileGroups(matching).length > 1} showCount={showCount} embedded />
    </div>
  ) : null
}
