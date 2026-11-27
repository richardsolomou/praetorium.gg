import { Calculator, Crown, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Datasheet } from '../../../contracts/catalogue'
import { modelCountChoices } from '../../../core/unitSize'
import { Stepper } from '../../components/Stepper'
import { countLabel } from '../../text'
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
  canAdd,
  limitMessageId,
  onAdd,
  unit,
  frozenUnit,
  selected,
  requiredWarlord,
  edit,
}: {
  preview: { entryId: string } | null
  building: boolean
  canAdd: boolean
  /** The id of the message saying why the previewed datasheet cannot be added, when there is one. */
  limitMessageId?: string
  onAdd: (entryId: string) => void
  unit: LoadoutUnit | null
  frozenUnit: FrozenRoster['units'][number] | null
  selected: number | null
  requiredWarlord?: { name: string }
  edit: ReturnType<typeof useRosterEdits>['edit']
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
        <span className="flex max-w-full shrink-0 flex-wrap items-center justify-start gap-x-3 gap-y-1.5">
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
              className={`${WARLORD} border ${warlord.selected ? 'border-parchment/60 bg-parchment/10 text-parchment' : requiredWarlord ? 'cursor-not-allowed border-edge text-faint' : 'border-edge text-dim hover:border-parchment/60 hover:text-bone'}`}
              onClick={() => selected !== null && edit.toggle(selected, warlord.key, warlord.name, !warlord.selected)}
            >
              <Crown className={`size-3.5 ${warlord.selected ? 'fill-current' : ''}`} />
              Warlord
            </button>
          ) : null}
          {warlord?.selected && !building ? (
            <span className={`${WARLORD} text-parchment`}>
              <Crown className="size-3.5 fill-current" /> Warlord
            </span>
          ) : null}
          {/* A frozen list costs what it was fielded at, whatever its datasheet is priced at now. */}
          {unit.size.resizable && building ? (
            <span className="inline-flex items-center gap-2">
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
                        selected !== null &&
                        edit.resize(selected, (models) => unit.size.options?.find((size) => size > models) ?? models + 1)
                    : undefined
                }
                blocked={`Max ${countLabel(unit.size.max, 'model')}`}
                choices={modelCountChoices(unit.size)}
                onChoose={(models) => selected !== null && edit.resize(selected, () => models)}
              />
              {/* The stepper's number says nothing on its own; the word says what it counts. */}
              <span aria-hidden className="text-sm text-dim">
                {unit.size.models === 1 ? 'model' : 'models'}
              </span>
            </span>
          ) : (
            <span className="text-sm text-dim">{countLabel(frozenUnit?.models ?? unit.size.models, 'model')}</span>
          )}
        </span>
      ) : frozenUnit ? (
        // The list as fought, before the price behind it has said anything.
        <span className="flex shrink-0 flex-wrap items-center justify-start gap-x-3 gap-y-1.5">
          <span className="text-sm text-dim">{countLabel(frozenUnit.models, 'model')}</span>
        </span>
      ) : null}
      {/* Last and pushed to the row's end, so a cost that changes with the model count moves nothing beside it. */}
      {!preview && (unit || frozenUnit) ? <UnitCost points={frozenUnit?.points ?? unit!.points} /> : null}
    </>
  )
}

/** The Warlord mark, a small rounded toggle in the colour the roster's own Warlord line wears. */
const WARLORD = 'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-sm font-semibold transition-colors'

/** What the unit costs, as the figure its row shows, at the end of the row, with its unit read aloud. */
function UnitCost({ points }: { points: number }) {
  return (
    <span className="figure ml-auto pl-3 text-2xl leading-none text-bone">
      {points}
      <span className="sr-only"> pts</span>
    </span>
  )
}

/** What the loadout pane offers about the unit rather than its loadout, beside its name: simulate it, or open its datasheet. */
export function LoadoutPaneTools({
  frozen,
  preview,
  selected,
  combatDisabled,
  onCombat,
  showReference,
  referenceRoute,
}: {
  frozen: boolean
  preview: { entryId: string } | null
  selected: number | null
  combatDisabled: boolean
  onCombat: (pickIndex: number) => void
  showReference: boolean
  referenceRoute: Datasheet['referenceRoute'] | undefined | null
}) {
  return (
    <>
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
