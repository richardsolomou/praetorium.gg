import { Minus, Plus } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { datasheetQuery } from '../../queries'
import type { Datasheet } from '../../../server/catalogue'
import type { RosterPick } from '../../../core/roster'
import { KeywordList } from '../Keyword'
import { HoverTooltip } from '../HoverTooltip'
import { SearchableSelect } from '../SearchableSelect'

/** Base UI selects cannot hold an empty value, so declining a choice needs a token. */
const NONE = '__none__'

type LoadoutChoice = {
  key: string
  name: string
  chosen: string
  room: number
  options: { id: string; name: string; points: number; count: number }[]
}

type LoadoutUnit = {
  entryId: string
  name: string
  points: number
  size: { min: number; max: number; models: number; resizable: boolean }
  choices: LoadoutChoice[]
}

type Props = {
  catalogueId: string
  catalogueSlug: string
  unit: LoadoutUnit | null
  detachmentIds: readonly string[]
  picks: readonly RosterPick[]
  pickIndex: number | null
  onChoose: (key: string, optionId: string) => void
  onSpread: (key: string, counts: Record<string, number>) => void
}

/**
 * What the selected unit is carrying.
 *
 * Squad size is not here: it is on the card, where the roster is, because one
 * control with one name is worth more than two that agree.
 *
 * Two kinds of choice, because the data holds two. A group with room for one is an
 * either-or — a captain's relic blade or his power sword — and reads as a choice. A
 * group with room for more is the squad dividing itself, eight blasters and two
 * carbines, which a single answer cannot say; that one gets a count against each
 * option. Nothing is typed either way: every option and every price is the data's.
 */
export function Loadout({ catalogueId, catalogueSlug, unit, detachmentIds, picks, pickIndex, onChoose, onSpread }: Props) {
  const [context, setContext] = useState({ detachmentIds, picks, pickIndex })
  useEffect(() => {
    const timeout = window.setTimeout(() => setContext({ detachmentIds, picks, pickIndex }), 150)
    return () => window.clearTimeout(timeout)
  }, [detachmentIds, picks, pickIndex])
  const { data: sheet } = useQuery(
    datasheetQuery(catalogueId, unit?.entryId ?? '', context.detachmentIds, context.picks, context.pickIndex),
  )
  if (!unit) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="max-w-52 text-center text-xs text-faint">Select a unit from the roster to edit its loadout.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-baseline justify-between gap-2 border-b border-edge p-2.5">
        <h2 className="truncate text-sm leading-tight">{unit.name}</h2>
        <span className="chip shrink-0">{unit.points} pts</span>
      </div>
      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]]:p-2.5">
        <div className="space-y-4">
          {sheet ? <DatasheetSummary catalogueSlug={catalogueSlug} sheet={sheet} /> : null}
          <section>
            <p className="rubric flex items-baseline justify-between border-b border-edge pb-1.5">
              <span>Wargear options</span>
              <span className="readout">{unit.choices.length}</span>
            </p>
            <div className="mt-3 space-y-4">
              {unit.choices.length ? (
                unit.choices.map((choice) => (choice.room > 1 ? spread(choice, onSpread) : either(choice, onChoose, unit.name)))
              ) : (
                <p className="text-xs text-faint">Nothing on this datasheet is optional.</p>
              )}
            </div>
          </section>
        </div>
      </ScrollArea>
    </div>
  )
}

function DatasheetSummary({ catalogueSlug, sheet }: { catalogueSlug: string; sheet: Datasheet }) {
  const model = sheet.profiles.find((profile) => profile.type === 'Unit')
  const weapons = sheet.profiles.filter((profile) => profile.type === 'Ranged Weapons' || profile.type === 'Melee Weapons')
  const abilities = sheet.profiles.filter((profile) => profile.type === 'Abilities')
  return (
    <div className="space-y-3 border-b border-edge pb-4">
      {model ? (
        <div className="grid grid-cols-7 gap-1">
          {model.values.map((value) => (
            <div key={value.name} className="text-center">
              <p className="eyebrow">{value.name}</p>
              <p className="readout text-sm">
                <ProfileValue value={value} />
              </p>
            </div>
          ))}
        </div>
      ) : null}
      {weapons.length ? (
        <div>
          <p className="eyebrow flex items-baseline justify-between border-b border-edge pb-1">
            <span>Weapons</span>
            <span className="readout">{weapons.length}</span>
          </p>
          <div className="mt-1.5 space-y-1.5">
            {weapons.map((weapon) => (
              <article key={weapon.id} className="border border-edge bg-card px-2 py-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="truncate text-xs">{weapon.name}</h3>
                  <span className="eyebrow shrink-0">{weapon.type.replace(' Weapons', '')}</span>
                </div>
                <div className="mt-1 grid grid-cols-6 gap-1">
                  {weapon.values
                    .filter((value) => value.name !== 'Keywords')
                    .map((value) => (
                      <div key={value.name} className="min-w-0 text-center">
                        <p className="eyebrow text-[0.625rem]">{value.name}</p>
                        <p className="readout text-xs text-faint">
                          <ProfileValue value={value} />
                        </p>
                      </div>
                    ))}
                </div>
                {weapon.values.find((value) => value.name === 'Keywords')?.value ? (
                  <p className="mt-1 text-[0.6875rem] text-faint">
                    <KeywordList value={weapon.values.find((value) => value.name === 'Keywords')!.value} rules={sheet.keywordRules} />
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      ) : null}
      {abilities.length ? (
        <div className="flex flex-wrap gap-1">
          {abilities.map((ability) => (
            <span key={ability.id} className="chip">
              {ability.name}
            </span>
          ))}
        </div>
      ) : null}
      <Link
        to="/factions/$catalogueId/datasheets/$entryId"
        params={{ catalogueId: catalogueSlug, entryId: sheet.slug }}
        target="_blank"
        rel="noreferrer"
        className="eyebrow text-azure hover:text-bone"
      >
        View full datasheet
      </Link>
    </div>
  )
}

type DisplayValue = Datasheet['profiles'][number]['values'][number]

function ProfileValue({ value }: { value: DisplayValue }) {
  if (!value.baseValue || !value.modifiers?.length) return value.value
  const sources = value.modifiers.join(', ')
  return (
    <HoverTooltip
      className="font-semibold text-azure"
      label={`${value.name} ${value.value}, modified from ${value.baseValue} by ${sources}`}
      content={
        <>
          <strong className="block font-semibold">Modified {value.name}</strong>
          <span className="mt-1 block text-dim">
            {value.baseValue} → <span className="text-azure">{value.value}</span>
          </span>
          <span className="mt-1 block text-xs text-faint">{sources}</span>
        </>
      }
    >
      {value.value}
    </HoverTooltip>
  )
}

/**
 * A group the squad divides between its options, a count at a time.
 *
 * The group is always full — every model carries something — so adding one of an
 * option takes one off whichever option has the most to give. That is what the
 * datasheet says in words: each model may replace its blaster with a carbine.
 */
function spread(choice: LoadoutChoice, onSpread: Props['onSpread']) {
  const taken = choice.options.reduce((total, option) => total + option.count, 0)
  const room = choice.room - taken

  const donor = (exclude: string) =>
    choice.options.filter((option) => option.id !== exclude && option.count > 0).toSorted((left, right) => right.count - left.count)[0]

  const more = (option: LoadoutChoice['options'][number]) => {
    if (room > 0) return { [option.id]: option.count + 1 }
    const giving = donor(option.id)
    return giving ? { [option.id]: option.count + 1, [giving.id]: giving.count - 1 } : null
  }

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
          <li key={option.id} className="flex items-center gap-2 border border-edge bg-card px-2 py-1">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs">{option.name}</span>
              {option.points ? <span className="readout text-[0.6875rem] text-faint">+{option.points} each</span> : null}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              className="size-6"
              aria-label={`Fewer ${option.name}`}
              disabled={option.count <= 0}
              onClick={() => onSpread(choice.key, { [option.id]: option.count - 1 })}
            >
              <Minus />
            </Button>
            <span className="readout w-5 text-center text-sm" aria-label={`${option.name} count`}>
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
          </li>
        ))}
      </ul>
    </div>
  )
}

/** A group that holds one thing: which one. */
function either(choice: LoadoutChoice, onChoose: Props['onChoose'], unitName: string) {
  if (choice.options.length > 7) {
    return (
      <div key={choice.key}>
        <p className="eyebrow">{choice.name}</p>
        <SearchableSelect
          ariaLabel={`${unitName} ${choice.name}`}
          groups={[
            {
              label: '',
              items: choice.options.map((option) => ({
                label: `${option.name}${option.points ? ` (+${option.points})` : ''}`,
                value: option.id,
              })),
            },
          ]}
          value={choice.chosen}
          onValueChange={(value) => onChoose(choice.key, value)}
          placeholder="Choose"
          searchPlaceholder={`Search ${choice.name.toLowerCase()}…`}
          className="mt-1.5"
        />
      </div>
    )
  }

  return (
    <div key={choice.key}>
      <p className="eyebrow">{choice.name}</p>
      <Select
        value={choice.chosen || NONE}
        onValueChange={(value: string | null) => onChoose(choice.key, value === NONE ? '' : (value ?? ''))}
      >
        <SelectTrigger className="mt-1.5 h-9 w-full text-sm" aria-label={`${unitName} ${choice.name}`}>
          <SelectValue>{(value: unknown) => choice.options.find((option) => option.id === value)?.name ?? 'Choose'}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {choice.options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
              {option.points ? ` (+${option.points})` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
