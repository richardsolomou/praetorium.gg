import { PICKER_POPUP } from './CombatControls'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useContext, useState, type ReactNode } from 'react'
import { ChevronDown, Plus, Settings, WandSparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '../../components/Dialog'
import { MAX_COMBAT_MODELS } from '../../../core/combat'
import { modelCountChoices } from '../../../core/unitSize'
import { FactionLabel, FactionMark } from '../../components/FactionMark'
import { SearchableSelect } from '../../components/SearchableSelect'
import { combatLoadoutsQuery, combatUnitsQuery, factionIndexQuery, factionQuery, loadoutDatasheetsQuery } from '../../queries'
import { Loadout } from '../rosters/builder/Loadout'
import { Stepper } from '../../components/Stepper'
import { CombatSurvivorControls } from './CombatSurvivorControls'
import { UnitPicker } from '../../components/UnitPicker'
import { LoadoutOddsContext, LoadoutOddsStatus, LoadoutOptimizationContext, useOptionNote, useProfileNote } from './LoadoutOdds'
import { useLoadoutOdds } from './useLoadoutOdds'
import { namespaceLoadoutSpace } from '../../../core/combatLoadouts'
import { attachedProfilePrefix } from '../../../core/combatScenario'
import { WeaponProfileNote } from '../../components/DatasheetProfiles'
import type { Combatant } from './useCombatant'
import { useLoadoutOptimizer } from './useLoadoutOptimizer'
import { attachedUnit } from '../../../core/attachedUnits'
import { rulesVersionLabel } from '../../../core/catalogueEdition'
import { Problem } from '../../components/Problem'
import { countLabel } from '../../text'

const unitValue = (catalogueId: string, id: string) => JSON.stringify([catalogueId, id])

export function CombatantCard({
  side,
  combatant,
  armyControl,
  headingAction,
}: {
  side: string
  combatant: Combatant
  armyControl?: ReactNode
  headingAction?: ReactNode
}) {
  const [loadoutIndex, setLoadoutIndex] = useState<number | null>(null)
  const [survivorIndex, setSurvivorIndex] = useState<number | null>(null)
  const optimizer = useLoadoutOptimizer(combatant)
  const queryClient = useQueryClient()
  const factions = useQuery(factionIndexQuery())
  const catalogueUnits = useQuery({ ...combatUnitsQuery(), enabled: !combatant.roster })
  const { unit, picks, edit, ready, pick, pickIndex, battleUnit } = combatant
  const companionSurvivors = combatant.companionSurvivors.find((member) => member.pickIndex === survivorIndex)
  const members = [pickIndex, ...attachedUnit(picks.positioned, pickIndex)]
    .filter((index) => !combatant.availableUnits || combatant.availableUnits[index])
    .map((index) => ({
      index,
      name:
        combatant.price.data?.units[index]?.name ??
        combatant.sheets.data?.companions.find((member) => member.pickIndex === index)?.selected.name ??
        combatant.sheets.data?.attachmentOptions.find((option) => option.entryId === picks.positioned[index]?.entryId)?.name ??
        (picks.positioned[index] ? 'Loading…' : 'unit'),
      models:
        index === pickIndex
          ? combatant.models
          : (combatant.companionSurvivors.find((member) => member.pickIndex === index)?.models ??
            combatant.price.data?.units[index]?.size.models ??
            picks.positioned[index]?.models ??
            1),
    }))
  const totalModels = members.reduce((total, member) => total + member.models, 0)
  const indexedFaction = factions.data?.factions.find((entry) => entry.id === combatant.faction)
  // Exact root catalogue IDs are absent from the faction index, so a roster saved with one reads its own faction.
  const rosterFaction = useQuery({
    ...factionQuery(combatant.faction),
    enabled: combatant.roster && factions.isSuccess && !indexedFaction,
  })
  const selectedFaction = indexedFaction ?? (combatant.roster ? rosterFaction.data : undefined)
  const factionIcon = (catalogueId: string | undefined) => {
    const faction =
      factions.data?.factions.find((entry) => entry.id === catalogueId || entry.slug === catalogueId) ??
      (catalogueId === combatant.faction ? selectedFaction : undefined)
    return faction ? <FactionMark faction={faction} size="sm" /> : undefined
  }
  const failed = factions.isError || catalogueUnits.isError || combatant.price.isError || combatant.sheets.isError
  const unavailable =
    picks.positioned.length > 0 &&
    ((combatant.price.isSuccess && !unit) || (combatant.sheets.isSuccess && !combatant.sheets.data?.selected))
  const models = combatant.models
  const maximum = Math.min(MAX_COMBAT_MODELS, battleUnit?.startingModels ?? unit?.size.max ?? 0)
  const nextSize = (count: number, direction: -1 | 1) =>
    !battleUnit && unit?.size.options
      ? ((direction === 1 ? unit.size.options.find((size) => size > count) : unit.size.options.findLast((size) => size < count)) ?? count)
      : count + direction
  const more = nextSize(models, 1)
  const fewer = nextSize(models, -1)
  const selectedOutsideIndex =
    !combatant.roster &&
    ready &&
    pick &&
    unit &&
    !(catalogueUnits.data ?? []).some(
      (faction) => faction.catalogueId === combatant.faction && faction.units.some((entry) => entry.id === pick.entryId),
    )
      ? [
          {
            label: selectedFaction ? `${selectedFaction.displayName} · ${rulesVersionLabel(selectedFaction)}` : 'Selected unit',
            items: [
              {
                value: unitValue(combatant.faction, pick.entryId),
                label: unit.name,
                detail: `${unit.points} pts`,
                icon: factionIcon(combatant.faction),
              },
            ],
          },
        ]
      : []
  const unitPicker = combatant.roster ? (
    <SearchableSelect
      ariaLabel={`${side} unit`}
      popupClassName={PICKER_POPUP}
      loading={Boolean(pick) && !ready}
      placeholder="Choose a unit"
      value={String(pickIndex)}
      onValueChange={(index) => combatant.selectRosterUnit(Number(index))}
      groups={[
        {
          label: 'Roster units',
          items: (combatant.price.data?.units ?? []).flatMap((entry, index) =>
            combatant.availableUnits && !combatant.availableUnits[index]
              ? []
              : [
                  {
                    value: String(index),
                    icon: factionIcon(picks.positioned[index]?.catalogueId ?? combatant.catalogueId),
                    label: `${entry.name}${(combatant.price.data?.units ?? []).filter((candidate) => candidate.entryId === entry.entryId).length > 1 ? ` · ${index + 1}` : ''}`,
                  },
                ],
          ),
        },
      ]}
    />
  ) : (
    <UnitPicker
      ariaLabel={`${side} unit`}
      popupClassName={PICKER_POPUP}
      loading={Boolean(pick) && !ready}
      placeholder="Choose a unit"
      searchPlaceholder="Search units…"
      index={catalogueUnits.data ?? []}
      emptyText={catalogueUnits.isPending ? 'Loading units…' : undefined}
      extraGroups={selectedOutsideIndex}
      value={pick ? unitValue(combatant.faction, pick.entryId) : ''}
      onValueChange={(value) => {
        const [catalogueId, id] = JSON.parse(value) as [string, string]
        combatant.selectUnit(catalogueId, id)
      }}
    />
  )
  const warmLoadout = (index: number) => {
    const memberPick = picks.positioned[index]
    if (ready && memberPick)
      void queryClient
        .query(
          loadoutDatasheetsQuery(
            memberPick.catalogueId ?? combatant.catalogueId,
            memberPick.entryId,
            combatant.detachmentIds,
            picks.positioned,
            index,
          ),
        )
        .catch(() => undefined)
  }
  return (
    <div className="min-w-0 p-3 sm:p-4">
      <div className="mb-3 flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1" aria-label={`${side} unit actions`}>
        <div className="flex shrink-0 items-center gap-2">
          <h2 className="rubric">{side}</h2>
          {!combatant.roster ? (
            <SearchableSelect
              ariaLabel={`${side} add attached unit`}
              placeholder="Add member"
              searchPlaceholder="Search unit members…"
              value=""
              disabled={!ready || optimizer.busy || !combatant.sheets.data?.attachmentOptions.length}
              title={`Add a member to the ${side.toLowerCase()} unit`}
              trigger={<Plus className="size-4" aria-hidden />}
              className="size-7 shrink-0 justify-center p-0 text-primary"
              onValueChange={combatant.addAttachment}
              groups={(['bodyguard', 'leader', 'support'] as const).map((kind) => ({
                label: kind === 'bodyguard' ? 'Squads' : kind === 'leader' ? 'Leaders' : 'Support',
                items:
                  combatant.sheets.data?.attachmentOptions
                    .filter((option) => option.kind === kind)
                    .map((option) => ({
                      value: option.entryId,
                      label: option.name,
                      icon: factionIcon(option.factionSlug ?? option.catalogueId),
                    })) ?? [],
              }))}
            />
          ) : null}
          {headingAction}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {unit ? (
            <span className="flex min-h-5 items-center gap-2 whitespace-nowrap text-xs text-dim">
              <span>{countLabel(totalModels, 'model')}</span>
              <span className="readout text-sm text-info">
                {unit.points +
                  (combatant.sheets.data?.companions ?? []).reduce(
                    (total, member) => total + (combatant.price.data?.units[member.pickIndex]?.points ?? 0),
                    0,
                  )}{' '}
                pts
              </span>
            </span>
          ) : pick ? (
            <span aria-hidden className="flex min-h-5 items-center gap-2">
              <span className="h-4 w-14 animate-pulse bg-muted" />
              <span className="h-4 w-12 animate-pulse bg-muted" />
            </span>
          ) : (
            <span className="flex min-h-5 items-center gap-2 text-xs text-dim">
              <span className="w-14">— models</span>
              <span className="readout w-12 text-sm text-info">— pts</span>
            </span>
          )}
          {optimizer.available ? (
            <div className="flex items-center">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="sm"
                      className="relative h-7 w-12 shrink-0 overflow-hidden rounded-r-none px-1 tabular-nums"
                      disabled={!optimizer.enabled && !optimizer.busy}
                      onClick={() => (optimizer.busy ? optimizer.cancel() : void optimizer.optimize())}
                      aria-label={optimizer.busy ? `Cancel optimization, approximately ${optimizer.progress}% complete` : 'Optimize'}
                    >
                      {optimizer.busy ? <span>{optimizer.progress}%</span> : <WandSparkles className="size-4" aria-hidden />}
                    </Button>
                  }
                />
                <TooltipContent role="tooltip" side="bottom">
                  {optimizer.busy
                    ? 'Cancel optimization and keep improvements'
                    : 'Optimize the whole unit’s loadout for the best chance to destroy the defender'}
                </TooltipContent>
              </Tooltip>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      size="sm"
                      className="h-7 w-6 rounded-l-none border-l border-background/30 px-0"
                      aria-label="Optimization options"
                      disabled={!optimizer.enabled || optimizer.busy}
                    />
                  }
                >
                  <ChevronDown className="size-3" aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-auto">
                  <DropdownMenuItem onClick={() => void optimizer.optimize('ranged')}>Optimize for ranged</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void optimizer.optimize('melee')}>Optimize for melee</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}
        </div>
      </div>
      {armyControl}
      {/* A saved roster's own picker already names it and its faction. */}
      {combatant.roster && !combatant.rosterName ? (
        <div className="mb-3 flex h-8 min-w-0 items-center gap-2 text-sm text-dim" aria-label={`${side} faction`}>
          {selectedFaction ? <FactionLabel faction={selectedFaction} /> : 'Loading faction…'}
          <span className="ml-auto text-xs text-faint">{battleUnit ? 'Battle' : 'Roster'}</span>
        </div>
      ) : null}
      <div className="min-h-8 space-y-2">
        <div className="space-y-1" aria-label={`${side} unit members`}>
          {members.map((member) => (
            <div key={member.index} className="flex min-w-0 flex-wrap items-center gap-2 text-sm" data-combat-member={member.name}>
              <div className="min-w-12 flex-1 [&_[data-slot=combobox-trigger]>span]:truncate">
                {member.index === pickIndex ? (
                  unitPicker
                ) : (
                  <SearchableSelect
                    ariaLabel={`${side} ${member.name} unit`}
                    popupClassName={PICKER_POPUP}
                    placeholder={member.name}
                    loading={!ready}
                    value={picks.positioned[member.index]?.entryId ?? ''}
                    disabled={combatant.roster || !ready || optimizer.busy}
                    searchPlaceholder="Search leaders and support…"
                    onValueChange={(entryId) => combatant.replaceAttachment(member.index, entryId)}
                    groups={[
                      {
                        label: 'Unit members',
                        items: combatant.sheets.data?.attachmentReplacements?.[member.index]?.map((option) => ({
                          value: option.entryId,
                          label: option.name,
                          icon: factionIcon(option.factionSlug ?? option.catalogueId),
                        })) ?? [
                          {
                            value: picks.positioned[member.index]?.entryId ?? '',
                            label: member.name,
                            icon: factionIcon(
                              combatant.sheets.data?.companions.find((companion) => companion.pickIndex === member.index)?.selected
                                .referenceRoute?.catalogueId ?? picks.positioned[member.index]?.catalogueId,
                            ),
                          },
                        ],
                      },
                    ]}
                  />
                )}
              </div>
              <div className="ml-auto flex max-w-full shrink-0 flex-wrap items-center gap-2">
                {member.index === pickIndex && (battleUnit || !unit || unit.size.resizable) ? (
                  <Stepper
                    label={`${side.toLowerCase()} models`}
                    countLabel={`${side} models`}
                    count={pick ? models : null}
                    loading={Boolean(pick) && !unit}
                    onRemove={
                      unit && unit.entryId === pick?.entryId && fewer < models && fewer >= (battleUnit ? 1 : unit.size.min)
                        ? () =>
                            battleUnit ? combatant.setHealth({ models: fewer }) : edit.resize(pickIndex, (count) => nextSize(count, -1))
                        : undefined
                    }
                    onAdd={
                      unit && unit.entryId === pick?.entryId && more > models && more <= maximum
                        ? () =>
                            battleUnit
                              ? combatant.setHealth({ models: more })
                              : edit.resize(pickIndex, (count) => Math.min(maximum, nextSize(count, 1)))
                        : undefined
                    }
                    choices={
                      unit && unit.entryId === pick?.entryId
                        ? modelCountChoices(battleUnit ? { min: 1, max: maximum } : { ...unit.size, max: maximum })
                        : undefined
                    }
                    onChoose={(count) => (battleUnit ? combatant.setHealth({ models: count }) : edit.resize(pickIndex, () => count))}
                  />
                ) : (
                  <span
                    aria-label={member.index === pickIndex ? `${side} models` : `${side} ${member.name} models`}
                    aria-busy={!combatant.price.data?.units[member.index]}
                    className="readout w-8 shrink-0 text-center text-sm text-dim"
                  >
                    {combatant.price.data?.units[member.index] ? (
                      member.models
                    ) : (
                      <span aria-hidden className="inline-block h-4 w-5 animate-pulse bg-muted align-middle" />
                    )}
                  </span>
                )}
                <Button
                  variant="outline"
                  size="icon-sm"
                  title="Loadout"
                  disabled={!ready}
                  onPointerEnter={() => warmLoadout(member.index)}
                  onFocus={() => warmLoadout(member.index)}
                  aria-label={member.index === pickIndex ? 'Loadout' : `${side} ${member.name} loadout`}
                  onClick={() => setLoadoutIndex(member.index)}
                >
                  <Settings className="size-4" aria-hidden />
                </Button>
                {battleUnit &&
                (member.index === pickIndex
                  ? models < battleUnit.startingModels
                  : combatant.companionSurvivors.some(
                      (candidate) =>
                        candidate.pickIndex === member.index &&
                        candidate.models < candidate.original.reduce((total, carrier) => total + carrier.models, 0),
                    )) ? (
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={member.index === pickIndex ? undefined : `${side} ${member.name} survivors`}
                    onClick={() => setSurvivorIndex(member.index)}
                  >
                    Survivors
                  </Button>
                ) : null}
                {!combatant.roster ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={members.length < 2 || !ready || optimizer.busy}
                    aria-label={`Remove ${side.toLowerCase()} ${member.name}`}
                    onClick={() => combatant.removeMember(member.index)}
                  >
                    <X aria-hidden />
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        {!unit && (failed || unavailable) ? (
          <p className="text-sm text-faint">
            {failed ? 'Unit data could not load.' : 'This unit cannot be configured. Choose another unit.'}
          </p>
        ) : null}
      </div>
      {optimizer.error ? <Problem className="mt-2 text-xs">{optimizer.error}</Problem> : null}
      {optimizer.notice ? (
        <output aria-live="polite" className="mt-2 block text-xs text-dim">
          {optimizer.notice}
        </output>
      ) : null}
      {combatant.sheets.data?.attachmentErrors.length ? (
        <p role="alert" className="mt-2 text-xs text-discarded">
          {combatant.sheets.data.attachmentErrors.map((error) => `${error.entryName}: ${error.message}`).join(' · ')}
        </p>
      ) : null}
      {battleUnit?.wounds && battleUnit.wounds > 1 ? (
        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-dim">
          <span>Wounded model · wounds left</span>
          <Stepper
            label={`${side.toLowerCase()} remaining wounds`}
            countLabel={`${side} remaining wounds`}
            count={battleUnit.wounds - combatant.damage}
            onRemove={combatant.damage < battleUnit.wounds - 1 ? () => combatant.setHealth({ damage: combatant.damage + 1 }) : undefined}
            onAdd={combatant.damage > 0 ? () => combatant.setHealth({ damage: combatant.damage - 1 }) : undefined}
            choices={modelCountChoices({ min: 1, max: battleUnit.wounds })}
            onChoose={(left) => battleUnit.wounds && combatant.setHealth({ damage: battleUnit.wounds - left })}
          />
        </div>
      ) : null}
      {failed ? (
        <Problem className="mt-2">
          Unit data could not load.{' '}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void factions.refetch()
              if (!combatant.roster) void catalogueUnits.refetch()
              if (picks.positioned.length) void combatant.price.refetch()
              if (unit) void combatant.sheets.refetch()
            }}
          >
            Retry
          </Button>
        </Problem>
      ) : null}
      {!factions.isPending && !factions.data ? (
        <p className="mt-2 text-sm text-dim">
          Army data is not available yet.{' '}
          <Button size="sm" variant="outline" onClick={() => void factions.refetch()}>
            Retry
          </Button>
        </p>
      ) : null}
      <Dialog
        open={survivorIndex !== null}
        onOpenChange={(open) => {
          if (!open) setSurvivorIndex(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{side} survivors</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {combatant.sheets.data ? (
              <CombatSurvivorControls
                key={companionSurvivors?.allocationKey ?? combatant.allocationKey}
                original={companionSurvivors?.original ?? combatant.sheets.data.carriers}
                models={companionSurvivors?.models ?? models}
                selected={companionSurvivors ? companionSurvivors.selected : combatant.survivors}
                onSelect={(carriers) => {
                  if (companionSurvivors) combatant.setAllocation(companionSurvivors.allocationKey, carriers)
                  else combatant.setSurvivors(carriers)
                  setSurvivorIndex(null)
                }}
              />
            ) : null}
          </DialogBody>
        </DialogContent>
      </Dialog>
      <Dialog
        open={loadoutIndex !== null}
        onOpenChange={(open) => {
          if (!open) setLoadoutIndex(null)
        }}
      >
        <DialogContent size="md" fill>
          <DialogHeader>
            <DialogTitle className="min-w-0">
              {side} · {loadoutIndex === null ? 'Loadout' : (members.find((member) => member.index === loadoutIndex)?.name ?? 'Loadout')}
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 min-w-0 flex-1" aria-busy={!ready}>
            {loadoutIndex !== null ? (
              <CombatMemberLoadout key={picks.picks[loadoutIndex]?.key} combatant={combatant} index={loadoutIndex} busy={optimizer.busy} />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CombatMemberLoadout({ combatant, index, busy }: { combatant: Combatant; index: number; busy: boolean }) {
  const mainOdds = useContext(LoadoutOddsContext)
  const context = useContext(LoadoutOptimizationContext)
  const primary = index === combatant.pickIndex
  const memberIndex = (combatant.sheets.data?.companions.findIndex((member) => member.pickIndex === index) ?? -1) + 1
  const prefix = primary ? '' : attachedProfilePrefix(index)
  const loadouts = useQuery({
    ...combatLoadoutsQuery({
      catalogueId: combatant.catalogueId,
      detachmentIds: combatant.detachmentIds,
      picks: combatant.picks.positioned,
      pickIndex: index,
    }),
    enabled: !primary && Boolean(context) && combatant.ready && !combatant.battleUnit,
    placeholderData: (previous, query) => (query?.queryKey[4] === index ? previous : undefined),
  })
  const memberOdds = useLoadoutOdds({
    space: !primary && loadouts.data ? namespaceLoadoutSpace(loadouts.data, prefix) : null,
    scoring: !primary && memberIndex && context?.scoring ? { ...context.scoring, memberIndex } : null,
    expected: context?.expected ?? { ranged: null, melee: null },
  })
  return (
    <LoadoutOddsContext.Provider value={primary ? mainOdds : memberOdds}>
      <CombatMemberLoadoutEditor combatant={combatant} index={index} busy={busy} prefix={prefix} />
    </LoadoutOddsContext.Provider>
  )
}

function CombatMemberLoadoutEditor({
  combatant,
  index,
  busy,
  prefix,
}: {
  combatant: Combatant
  index: number
  busy: boolean
  prefix: string
}) {
  const optionNote = useOptionNote()
  const profileNote = useProfileNote(prefix)
  const unit = combatant.price.data?.units[index]
  return (
    <WeaponProfileNote.Provider value={profileNote}>
      <LoadoutOddsStatus />
      <Loadout
        catalogueId={combatant.picks.positioned[index]?.catalogueId ?? combatant.catalogueId}
        unit={unit ?? null}
        loading={!unit}
        detachmentIds={combatant.detachmentIds}
        picks={combatant.picks.positioned}
        pickIndex={index}
        controlsDisabled={!combatant.ready || busy}
        onChoose={(key, id) => combatant.edit.choose(index, key, id)}
        onSpread={(key, update) => combatant.edit.spread(index, key, update)}
        optionNote={optionNote}
      />
    </WeaponProfileNote.Provider>
  )
}
