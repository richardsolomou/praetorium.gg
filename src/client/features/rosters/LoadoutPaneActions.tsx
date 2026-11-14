import { Calculator, Crown, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Datasheet } from '../../../contracts/catalogue'
import { modelCountChoices } from '../../../core/unitSize'
import { Stepper } from '../../components/Stepper'
import { countLabel } from '../../text'
import { PointsChip } from './builder/PointsChip'
import { FullDatasheetLink, FullDatasheetLinkLoading } from './FullDatasheetLink'
import type { FrozenRoster } from './ListBuilder'
import type { useRosterEdits } from './useRosterEdits'
import type { useRosterPrice } from './useRosterPrice'

type LoadoutUnit = ReturnType<typeof useRosterPrice>['units'][number]

/**
 * The loadout pane's header actions: adding a previewed datasheet, or the selected
 * unit's Warlord, points, and model count, then combat and the full datasheet.
 */
export function LoadoutPaneActions({
  preview,
  building,
  frozen,
  canAdd,
  limitMessageId,
  onAdd,
  unit,
  frozenUnit,
  selected,
  requiredWarlord,
  edit,
  combatDisabled,
  onCombat,
  showReference,
  referenceRoute,
}: {
  preview: { entryId: string } | null
  building: boolean
  frozen: boolean
  canAdd: boolean
  /** The id of the message saying why the previewed datasheet cannot be added, when there is one. */
  limitMessageId?: string
  onAdd: (entryId: string) => void
  unit: LoadoutUnit | null
  frozenUnit: FrozenRoster['units'][number] | null
  selected: number | null
  requiredWarlord?: { name: string }
  edit: ReturnType<typeof useRosterEdits>['edit']
  combatDisabled: boolean
  onCombat: (pickIndex: number) => void
  showReference: boolean
  referenceRoute: Datasheet['referenceRoute'] | undefined | null
}) {
  const warlord = unit?.toggles.find((toggle) => toggle.name === 'Warlord')
  return (
    <>
      {preview && building ? (
        <Button size="sm" className="px-2" disabled={!canAdd} aria-describedby={limitMessageId} onClick={() => onAdd(preview.entryId)}>
          <Plus className="size-3" />
          Add to list
        </Button>
      ) : unit ? (
        <span className="flex max-w-full shrink-0 flex-wrap items-center justify-start gap-1.5 @max-[30rem]:gap-1">
          {warlord && building ? (
            <button
              type="button"
              title={
                requiredWarlord
                  ? `${requiredWarlord.name} must be your Warlord`
                  : `${warlord.selected ? 'Remove' : 'Make'} ${unit.name} Warlord`
              }
              aria-label={`${warlord.selected ? 'Remove' : 'Make'} ${unit.name} Warlord`}
              aria-pressed={warlord.selected}
              disabled={Boolean(requiredWarlord)}
              className={`chip gap-1 ${warlord.selected ? 'text-info' : requiredWarlord ? 'cursor-not-allowed text-faint' : 'hover:border-info hover:text-bone'}`}
              onClick={() => selected !== null && edit.toggle(selected, warlord.key, warlord.name, !warlord.selected)}
            >
              <Crown className={`size-3.5 ${warlord.selected ? 'fill-current' : ''}`} />
              Warlord
            </button>
          ) : null}
          {warlord?.selected && !building ? (
            <span className="chip gap-1 text-info">
              <Crown className="size-3.5 fill-current" /> Warlord
            </span>
          ) : null}
          <PointsChip points={unit.points} />
          {unit.size.resizable && building ? (
            <Stepper
              label={`models in ${unit.name}`}
              countLabel={`${unit.name} models`}
              count={unit.size.models}
              onRemove={
                unit.size.models > unit.size.min
                  ? () =>
                      selected !== null &&
                      edit.resize(selected, (models) => unit.size.options?.findLast((size) => size < models) ?? models - 1)
                  : undefined
              }
              onAdd={
                unit.size.models < unit.size.max
                  ? () =>
                      selected !== null && edit.resize(selected, (models) => unit.size.options?.find((size) => size > models) ?? models + 1)
                  : undefined
              }
              blocked={`Max ${countLabel(unit.size.max, 'model')}`}
              choices={modelCountChoices(unit.size)}
              onChoose={(models) => selected !== null && edit.resize(selected, () => models)}
            />
          ) : (
            <span className="chip normal-case">{countLabel(unit.size.models, 'model')}</span>
          )}
        </span>
      ) : frozenUnit ? (
        // The list as fought, before the price behind it has said anything.
        <span className="flex shrink-0 flex-wrap items-center justify-start gap-1.5 @max-[30rem]:gap-1">
          <PointsChip points={frozenUnit.points} />
          <span className="chip normal-case">{countLabel(frozenUnit.models, 'model')}</span>
        </span>
      ) : null}
      {!frozen && !preview && selected !== null ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Simulate combat"
                disabled={combatDisabled}
                onClick={() => onCombat(selected)}
              />
            }
          >
            <Calculator aria-hidden />
          </TooltipTrigger>
          <TooltipContent role="tooltip" side="bottom">
            Simulate combat
          </TooltipContent>
        </Tooltip>
      ) : null}
      {showReference && referenceRoute !== null ? (
        referenceRoute ? (
          <FullDatasheetLink route={referenceRoute} />
        ) : (
          <FullDatasheetLinkLoading />
        )
      ) : null}
    </>
  )
}
