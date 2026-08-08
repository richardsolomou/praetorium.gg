import { useQuery } from '@tanstack/react-query'
import { Check, Minus, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { RosterPick } from '../../../core/roster'
import { datasheetQuery } from '../../queries'
import { SearchableSelect } from '../SearchableSelect'
import { RuleText } from '../RuleText'
import { WeaponSummary } from './DatasheetPanel'

/** Base UI selects cannot hold an empty value, so declining a choice needs a token. */
const NONE = '__none__'

type LoadoutChoice = {
  key: string
  name: string
  chosen: string
  optional: boolean
  room: number
  options: { id: string; name: string; points: number; count: number; description?: string | null }[]
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
export function Loadout({ catalogueId, unit, detachmentIds, picks, pickIndex, onChoose, onSpread }: Props) {
  const [context, setContext] = useState({ detachmentIds, picks, pickIndex })
  useEffect(() => {
    const timeout = window.setTimeout(() => setContext({ detachmentIds, picks, pickIndex }), 150)
    return () => window.clearTimeout(timeout)
  }, [detachmentIds, picks, pickIndex])
  const { data: sheet } = useQuery({
    ...datasheetQuery(catalogueId, unit?.entryId ?? '', context.detachmentIds, context.picks, context.pickIndex),
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[2] === unit?.entryId ? previous : undefined),
  })

  if (!unit) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="max-w-52 text-center text-xs text-faint">Select a unit from the roster to edit its loadout.</p>
      </div>
    )
  }
  const ranged = sheet?.profiles.filter((profile) => profile.type === 'Ranged Weapons') ?? []
  const melee = sheet?.profiles.filter((profile) => profile.type === 'Melee Weapons') ?? []

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-edge p-2.5">
        <h2 className="text-sm leading-tight">{unit.name}</h2>
        <span className="chip mt-1.5 inline-block">{unit.points} pts</span>
      </div>
      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]]:p-2.5">
        <div className="space-y-4">
          {ranged.length && sheet ? <WeaponSummary title="Ranged weapons" weapons={ranged} rules={sheet.keywordRules} /> : null}
          {melee.length && sheet ? <WeaponSummary title="Melee weapons" weapons={melee} rules={sheet.keywordRules} /> : null}
          <section>
            <p className="rubric flex items-baseline justify-between border-b border-edge pb-1.5">
              <span>Wargear options</span>
              <span className="readout">{unit.choices.length}</span>
            </p>
            <div className="mt-3 space-y-4">
              {unit.choices.length ? (
                unit.choices.map((choice) =>
                  choice.name.toLowerCase().includes('enhancement')
                    ? enhancement(choice, onChoose, unit.name)
                    : choice.room > 1
                      ? spread(choice, onSpread)
                      : either(choice, onChoose, unit.name),
                )
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

function enhancement(choice: LoadoutChoice, onChoose: Props['onChoose'], unitName: string) {
  return (
    <fieldset key={choice.key} aria-label={`${unitName} ${choice.name}`} className="m-0 min-w-0 border-0 p-0">
      <legend className="eyebrow p-0">{choice.name}</legend>
      <div className="mt-1.5 space-y-1.5">
        {choice.optional ? (
          <button
            type="button"
            aria-pressed={!choice.chosen}
            onClick={() => onChoose(choice.key, '')}
            className={`flex w-full items-center justify-between border px-2.5 py-2 text-left text-xs font-semibold uppercase ${
              choice.chosen ? 'border-edge bg-card text-dim hover:border-dim hover:text-bone' : 'border-azure bg-azure/10 text-azure'
            }`}
          >
            No enhancement
            {!choice.chosen ? <Check className="size-3.5" aria-hidden /> : null}
          </button>
        ) : null}
        {choice.options.map((option) => {
          const selected = choice.chosen === option.id
          return (
            <article key={option.id} className={`border ${selected ? 'border-azure bg-azure/10' : 'border-edge bg-card'}`}>
              <button
                type="button"
                aria-pressed={selected}
                aria-label={`Select ${option.name}`}
                onClick={() => onChoose(choice.key, option.id)}
                className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left hover:bg-raised"
              >
                <span className="text-sm font-semibold text-bone">{option.name}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {option.points ? <span className="chip">+{option.points} pts</span> : null}
                  {selected ? <Check className="size-3.5 text-azure" aria-hidden /> : null}
                </span>
              </button>
              {option.description ? (
                <div className="border-t border-edge px-2.5 pb-2">
                  <RuleText text={option.description} />
                </div>
              ) : null}
            </article>
          )
        })}
      </div>
    </fieldset>
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

  const less = (option: LoadoutChoice['options'][number]) => {
    if (option.count <= 0) return null
    if (taken < choice.room) return { [option.id]: option.count - 1 }
    const receiving = choice.options
      .filter((candidate) => candidate.id !== option.id)
      .toSorted((left, right) => right.count - left.count)[0]
    return receiving ? { [option.id]: option.count - 1, [receiving.id]: receiving.count + 1 } : null
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
              disabled={!less(option)}
              onClick={() => {
                const next = less(option)
                if (next) onSpread(choice.key, next)
              }}
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
    const items = choice.options.map((option) => ({
      label: `${option.name}${option.points ? ` (+${option.points})` : ''}`,
      value: option.id,
    }))
    if (choice.optional) items.unshift({ label: 'None', value: NONE })
    return (
      <div key={choice.key}>
        <p className="eyebrow">{choice.name}</p>
        <SearchableSelect
          ariaLabel={`${unitName} ${choice.name}`}
          groups={[
            {
              label: '',
              items,
            },
          ]}
          value={choice.chosen || (choice.optional ? NONE : '')}
          onValueChange={(value) => onChoose(choice.key, value === NONE ? '' : value)}
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
          {choice.optional ? <SelectItem value={NONE}>None</SelectItem> : null}
          {choice.options.map((option) => (
            <SelectItem key={option.id} value={option.id} className={option.description ? 'items-start py-2 whitespace-normal' : undefined}>
              <span className="min-w-0">
                <span className="block">
                  {option.name}
                  {option.points ? ` (+${option.points})` : ''}
                </span>
                {option.description ? <RuleText text={option.description} /> : null}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
