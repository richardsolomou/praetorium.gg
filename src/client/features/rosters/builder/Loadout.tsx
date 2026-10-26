import { useQuery } from '@tanstack/react-query'
import { usePostHog } from '@posthog/react'
import { cloneElement, type ReactElement, type ReactNode, useEffect, useRef } from 'react'
import type { Datasheet } from '../../../../contracts/catalogue'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { RosterPick } from '../../../../core/roster'
import { isUnitCompositionChoice } from '../../../../core/unitChoices'
import { primaryUnitProfile } from '../../../datasheet'
import { datasheetLoad, loadoutDatasheetsQuery } from '../../../queries'
import type { loadoutDatasheets } from '../../../functions'
import { useSettled } from '../../../useSettled'
import { UnitProfile, WeaponSummary } from '../../../components/DatasheetProfiles'
import {
  type LoadoutModel,
  type LoadoutUnit,
  orderedChoices,
  unmodeledGrantedWeapons,
  type SpreadUpdate,
  wholeSquadTakes,
} from './loadoutModel'
import { EitherChoice, LoadoutLoading, type OptionNote, SpecialChoice, SpreadChoice } from './LoadoutControls'
import { ModelCard } from './ModelCard'
import type { ReminderControls } from '../ReminderButton'
import { Problem } from '../../../components/Problem'

type Props = {
  catalogueId: string
  unit: LoadoutUnit | null
  loading?: boolean
  detachmentIds: readonly string[]
  picks: readonly RosterPick[]
  pickIndex: number | null
  onChoose: (key: string, optionId: string) => void
  onSpread: (key: string, update: SpreadUpdate) => void
  editable?: boolean
  embedded?: boolean
  controlsDisabled?: boolean
  showOptions?: boolean
  reference?: ReactElement<{ providedSheet?: Datasheet | null }>
  /** A persisted read-only roster can be resolved without sending its picks. */
  persistedRoster?: { id: string; battle?: string }
  reminders?: ReminderControls
  /** Something to say beside an option, such as what it would do in a combat simulation. */
  optionNote?: OptionNote
  providedSheets?: Awaited<ReturnType<typeof loadoutDatasheets>>
  /** The roster's own fields for this unit, scrolled with the loadout. */
  header?: ReactNode
  /** Shown below everything else the pane holds. */
  footer?: ReactNode
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
  loading = false,
  detachmentIds,
  picks,
  pickIndex,
  onChoose,
  onSpread,
  editable = true,
  embedded = false,
  controlsDisabled = false,
  showOptions = true,
  reference,
  persistedRoster,
  reminders,
  optionNote,
  providedSheets,
  header,
  footer,
}: Props) {
  const posthog = usePostHog()
  const capturedAt = useRef(0)
  // Only once the player stops changing the list, so a held stepper asks once.
  const detachments = useSettled(detachmentIds)
  const settledPicks = useSettled(picks)

  // A pane that swapped units keeps nothing from the last one; one that only had a
  // count changed keeps what it was showing, so the profiles do not blink.
  const forSameUnit = (previousQuery?: { queryKey: readonly unknown[] }) => previousQuery?.queryKey[2] === unit?.entryId
  const request = loadoutDatasheetsQuery(catalogueId, unit?.entryId ?? '', detachments, settledPicks, pickIndex, persistedRoster)
  const {
    data: fetchedSheets,
    dataUpdatedAt,
    isError,
    isPending,
  } = useQuery({
    ...request,
    enabled: providedSheets === undefined && request.enabled && (pickIndex === null || settledPicks[pickIndex]?.entryId === unit?.entryId),
    placeholderData: (previous, previousQuery) => (forSameUnit(previousQuery) ? previous : undefined),
  })
  const sheets = providedSheets ?? fetchedSheets
  useEffect(() => {
    const measured = sheets && datasheetLoad(sheets)
    if (!sheets || !measured || dataUpdatedAt <= capturedAt.current) return
    capturedAt.current = dataUpdatedAt
    const frame = requestAnimationFrame(() => {
      posthog.capture('roster_datasheet_rendered', {
        unit_count: picks.length,
        request_duration_ms: Math.round(measured.request),
        render_duration_ms: Math.round(performance.now() - measured.resolvedAt),
        editable,
        datacard_join: sheets.datacardJoin,
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [dataUpdatedAt, editable, picks.length, posthog, sheets])
  const sheet = sheets?.selected
  // Every weapon the unit could take, priced and modified as this list would have
  // it: an enhancement that adds to a weapon's Attacks is part of the choice, so it
  // has to be visible before the choice is made rather than after.
  const availableSheet = sheets?.available

  if (loading) return <LoadoutLoading />
  if (!unit) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="max-w-52 text-center text-xs text-faint">Select a unit from the roster to see its loadout.</p>
      </div>
    )
  }
  if (!sheet || !availableSheet) {
    return isError || !isPending ? (
      <Problem className="p-3 text-xs">This loadout could not be loaded. Try again shortly.</Problem>
    ) : (
      <LoadoutLoading />
    )
  }

  const weapons = availableSheet.profiles.filter((profile) => profile.type === 'Ranged Weapons' || profile.type === 'Melee Weapons')
  const rules = availableSheet.keywordRules
  const abilities = availableSheet.abilities

  const equippedRanged = sheet.profiles.filter((profile) => profile.type === 'Ranged Weapons')
  const equippedMelee = sheet.profiles.filter((profile) => profile.type === 'Melee Weapons')
  const extraRanged = unmodeledGrantedWeapons(equippedRanged, unit.models, unit.choices)
  const extraMelee = unmodeledGrantedWeapons(equippedMelee, unit.models, unit.choices)
  const profile = primaryUnitProfile(sheet)

  const { models, loose } = divide(unit)
  const saved = pickIndex === null ? undefined : picks[pickIndex]?.spreads
  const visibleLoose = showOptions
    ? loose
    : loose.filter((choice) => choice.options.some((option) => option.count || choice.chosen === option.id))
  const described = { weapons, abilities, rules }
  const Container = embedded ? 'div' : ScrollArea

  return (
    <div className={`flex min-w-0 flex-col ${embedded ? '' : 'h-full'}`}>
      <Container
        className={
          embedded
            ? 'min-w-0 p-2.5'
            : 'min-h-0 min-w-0 max-w-full flex-1 overflow-hidden [&_[data-slot=scroll-area-viewport]]:touch-pan-y [&_[data-slot=scroll-area-viewport]]:!overflow-x-hidden [&_[data-slot=scroll-area-viewport]]:overscroll-x-none [&_[data-slot=scroll-area-viewport]]:p-2.5'
        }
      >
        <div className="w-full min-w-0 space-y-4">
          {header}
          {profile ? <UnitProfile profile={profile} /> : null}
          {unit.models.length ? (
            <div className="space-y-6">
              {unit.models.map((model) => (
                <ModelCard
                  // A datasheet can name two kinds of model the same, so what tells
                  // the cards apart is the models they hold rather than the heading.
                  key={model.members.map((member) => member.id).join('/')}
                  model={model}
                  models={unit.models}
                  wargearGroups={availableSheet.wargearGroups}
                  choices={unit.choices}
                  stands={models.get(model) ?? null}
                  onChoose={onChoose}
                  onSpread={onSpread}
                  editable={editable}
                  controlsDisabled={controlsDisabled}
                  showOptions={showOptions}
                  optionNote={optionNote}
                  saved={saved}
                  {...described}
                />
              ))}
              {extraRanged.length ? <WeaponSummary title="Equipped ranged weapons" weapons={extraRanged} rules={rules} /> : null}
              {extraMelee.length ? <WeaponSummary title="Equipped melee weapons" weapons={extraMelee} rules={rules} /> : null}
            </div>
          ) : (
            <>
              {equippedRanged.length ? <WeaponSummary title="Equipped ranged weapons" weapons={equippedRanged} rules={rules} /> : null}
              {equippedMelee.length ? <WeaponSummary title="Equipped melee weapons" weapons={equippedMelee} rules={rules} /> : null}
            </>
          )}
          {visibleLoose.length ? (
            <section>
              <h3 className="rubric flex items-baseline justify-between border-b border-edge pb-1.5">
                <span>Wargear options</span>
                <span className="readout">{visibleLoose.length}</span>
              </h3>
              <div className="mt-3 grid gap-5">
                {orderedChoices(visibleLoose, weapons).map((choice) =>
                  choice.kind ? (
                    <SpecialChoice
                      key={choice.key}
                      choice={choice}
                      unitName={unit.name}
                      editable={editable}
                      controlsDisabled={controlsDisabled}
                      onChoose={onChoose}
                      showOptions={showOptions}
                      reminders={reminders}
                    />
                  ) : choice.room > 1 && !choice.uniform ? (
                    <SpreadChoice
                      key={choice.key}
                      choice={choice}
                      editable={editable}
                      controlsDisabled={controlsDisabled}
                      onSpread={onSpread}
                      weapons={weapons}
                      abilities={availableSheet.abilities}
                      rules={rules}
                      showOptions={showOptions}
                      optionNote={optionNote}
                      saved={saved?.[choice.key]}
                    />
                  ) : (
                    <EitherChoice
                      key={choice.key}
                      choice={choice}
                      unitName={unit.name}
                      editable={editable}
                      controlsDisabled={controlsDisabled}
                      // A squad that must match answers once, and every model follows.
                      onChoose={choice.uniform ? (key, optionId) => onSpread(key, () => wholeSquadTakes(choice, optionId)) : onChoose}
                      weapons={weapons}
                      abilities={availableSheet.abilities}
                      rules={rules}
                      showOptions={showOptions}
                      optionNote={optionNote}
                    />
                  ),
                )}
              </div>
            </section>
          ) : null}
          {sheet && reference ? cloneElement(reference, { providedSheet: sheet }) : null}
          {footer}
        </div>
      </Container>
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
  const loose = unit.choices.filter(
    (choice) =>
      !(unit.size.options?.length && isUnitCompositionChoice(choice)) &&
      !modelled.has(choice.key) &&
      !choice.options.every((option) => carded.has(option.id)),
  )

  // A card only counts its own option where the group is not drawn below as well.
  const models = new Map([...stood].filter(([, found]) => !loose.includes(found.choice)))
  return { models, loose }
}
