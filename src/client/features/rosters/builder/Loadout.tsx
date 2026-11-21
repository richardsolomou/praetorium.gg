import { useQuery } from '@tanstack/react-query'
import { usePostHog } from '@posthog/react'
import { cloneElement, type ReactElement, type ReactNode, useEffect, useMemo, useRef } from 'react'
import type { Datasheet } from '../../../../contracts/catalogue'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { RosterPick } from '../../../../core/roster'
import { isUnitCompositionChoice } from '../../../../core/unitChoices'
import { primaryUnitProfile, weaponProfileGroups } from '../../../datasheet'
import { datasheetLoad, type Fielded, loadoutDatasheetsQuery } from '../../../queries'
import { useSettled } from '../../../useSettled'
import { UnitProfile, type WeaponMark, WeaponProfiles, WeaponSummary } from '../../../components/DatasheetProfiles'
import {
  type LoadoutModel,
  type LoadoutUnit,
  profilesCarry,
  viewedWeapons,
  orderedChoices,
  unmodeledGrantedWeapons,
  weaponTotals,
  type SpreadUpdate,
  wholeSquadTakes,
} from './loadoutModel'
import { EitherChoice, LoadoutLoading, type OptionNote, SpecialChoice, SpreadChoice, type StandingWargear } from './LoadoutControls'
import { ModelCard } from './ModelCard'
import { BattleChoices, useBattleChoices } from './BattleChoices'
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
  persistedRoster?: { id: string }
  /** A list a battle or sealed event froze, read on the rules version it was fielded under. */
  fielded?: Fielded
  /** Shown in place of the loadout when its datasheet cannot be read. */
  unavailable?: ReactNode
  reminders?: ReminderControls
  /** Something to say beside an option, such as what it would do in a combat simulation. */
  optionNote?: OptionNote
  /** The roster's own fields for this unit, scrolled with the loadout. */
  header?: ReactNode
  /** Shown below everything else the pane holds. */
  footer?: ReactNode
  /** Whose in-battle picks the pane offers, as a list or an army in a battle, showing the profiles as each leaves them. */
  battleChoices?: string
  /** What a battle's survivors still carry, so wargear nobody standing holds reads as gone. */
  standing?: StandingWargear
}

/**
 * What the selected unit is carrying.
 *
 * While building, a card per kind of model, the way a datasheet reads, and below them
 * whatever the unit chooses as a whole. Read-only, every gun the unit fires in one list
 * and the melee weapons by model, since each model fights with only one. Deciding which
 * of the two places a choice belongs to is this file's only real work — the controls themselves live in `LoadoutControls.tsx` and
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
  fielded = false,
  unavailable,
  reminders,
  optionNote,
  header,
  footer,
  battleChoices,
  standing,
}: Props) {
  const posthog = usePostHog()
  const capturedAt = useRef(0)
  // Only once the player stops changing the list, so a held stepper asks once.
  const detachments = useSettled(detachmentIds)
  const settledPicks = useSettled(picks)

  // A pane that swapped units keeps nothing from the last one; one that only had a
  // count changed keeps what it was showing, so the profiles do not blink.
  const forSameUnit = (previousQuery?: { queryKey: readonly unknown[] }) => previousQuery?.queryKey[2] === unit?.entryId
  const request = loadoutDatasheetsQuery(catalogueId, unit?.entryId ?? '', detachments, settledPicks, pickIndex, persistedRoster, fielded)
  const {
    data: sheets,
    dataUpdatedAt,
    isError,
    isPending,
  } = useQuery({
    ...request,
    enabled: request.enabled && (pickIndex === null || settledPicks[pickIndex]?.entryId === unit?.entryId),
    placeholderData: (previous, previousQuery) => (forSameUnit(previousQuery) ? previous : undefined),
  })
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
  const { sheet: battleSheet, ...battle } = useBattleChoices({
    scope: battleChoices,
    catalogueId,
    entryId: unit?.entryId,
    detachmentIds: detachments,
    picks: settledPicks,
    pickIndex,
    fielded,
  })
  const sheet = useMemo(() => battleSheet(sheets?.selected), [battleSheet, sheets?.selected])
  // Every weapon the unit could take, priced and modified as this list would have
  // it: an enhancement that adds to a weapon's Attacks is part of the choice, so it
  // has to be visible before the choice is made rather than after.
  const availableSheet = useMemo(() => battleSheet(sheets?.available), [battleSheet, sheets?.available])

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
      (unavailable ?? <Problem className="p-3 text-xs">This loadout could not be loaded. Try again shortly.</Problem>)
    ) : (
      <LoadoutLoading />
    )
  }

  const weapons = availableSheet.profiles.filter((profile) => profile.type === 'Ranged Weapons' || profile.type === 'Melee Weapons')
  const rules = battle.keywordRules(availableSheet.keywordRules)
  const abilities = availableSheet.abilities

  const equippedRanged = weaponTotals(sheet.profiles.filter((profile) => profile.type === 'Ranged Weapons'))
  const equippedMelee = weaponTotals(sheet.profiles.filter((profile) => profile.type === 'Melee Weapons'))
  const extraRanged = unmodeledGrantedWeapons(equippedRanged, unit.models, unit.choices)
  const extraMelee = unmodeledGrantedWeapons(equippedMelee, unit.models, unit.choices)
  const profile = primaryUnitProfile(sheet)

  const viewed = showOptions ? null : viewedWeapons(unit, weapons, sheet.profiles)
  const mark: WeaponMark | undefined = standing
    ? (profiles) => {
        const carries = (piece: string) => profilesCarry(profiles, piece)
        return { fallen: standing.fallen(carries), sought: standing.sought(carries), left: standing.left(carries) }
      }
    : undefined
  const { models, loose } = divide(unit)
  const saved = pickIndex === null ? undefined : picks[pickIndex]?.spreads
  // Read-only views list the unit's weapons by type, so only choices that are not wargear stay below them.
  const visibleLoose = showOptions
    ? loose
    : loose.filter((choice) => choice.kind && choice.options.some((option) => option.count || choice.chosen === option.id))
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
          <div className="space-y-1.5">
            {profile ? <UnitProfile profile={profile} /> : null}
            <BattleChoices choices={battle.choices} chosen={battle.chosen} onChoose={battle.choose} rules={rules} />
          </div>
          {viewed ? (
            <div className="space-y-6">
              {viewed.ranged.length ? (
                <WeaponSummary title="Equipped ranged weapons" weapons={viewed.ranged} rules={rules} mark={mark} />
              ) : null}
              <MeleeByModel groups={viewed.melee} rules={rules} mark={mark} />
            </div>
          ) : unit.models.length ? (
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
                  standing={standing}
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

function MeleeByModel({
  groups,
  rules,
  mark,
}: {
  groups: ReturnType<typeof viewedWeapons>['melee']
  rules: Datasheet['keywordRules']
  mark?: WeaponMark
}) {
  const [whole] = groups
  if (!whole?.weapons.length) return null
  const choose = (count: number) => (
    <span className="font-rules text-xs font-normal normal-case text-info">{count > 1 ? 'Choose one each' : 'Choose one'}</span>
  )
  const byModel = groups.some((group) => group.name)
  if (!byModel && !whole.choose) return <WeaponSummary title="Equipped melee weapons" weapons={whole.weapons} rules={rules} mark={mark} />
  return (
    <section>
      <h2 className="rubric flex items-baseline justify-between gap-2">
        <span>Equipped melee weapons</span>
        {byModel ? <span className="font-rules text-xs font-normal normal-case text-faint">One per model</span> : choose(whole.count)}
      </h2>
      <div className="mt-2 space-y-3">
        {groups.map((group) => {
          const states = weaponProfileGroups(group.weapons).map((profiles) => mark?.(profiles))
          const fallen = states.every((state) => state?.fallen)
          return (
            <div key={group.key} data-sought={states.some((state) => state?.sought) || undefined} className="scroll-mt-2.5">
              {group.name ? (
                <p className={`eyebrow mb-1.5 flex items-baseline justify-between gap-2 text-bone ${fallen ? 'opacity-50' : ''}`}>
                  <span className={`min-w-0 ${fallen ? 'line-through' : ''}`}>
                    {group.name}
                    {group.choose ? <span className="ml-2">{choose(group.count)}</span> : null}
                  </span>
                  <span className="readout normal-case text-dim">{group.count}</span>
                </p>
              ) : null}
              <div className="space-y-1.5">
                <WeaponProfiles weapons={group.weapons} rules={rules} mark={mark} />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
