import { useQuery } from '@tanstack/react-query'
import { Check, Crown, Minus, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Toggle } from '@/components/ui/toggle'
import type { RosterPick } from '../../../core/roster'
import type { Datasheet } from '../../../server/catalogue'
import { datasheetQuery } from '../../queries'
import { RuleText } from '../RuleText'
import { WeaponProfile, WeaponSummary } from './DatasheetPanel'

type LoadoutChoice = {
  key: string
  name: string
  chosen: string
  optional: boolean
  room: number
  kind?: 'enhancement' | 'upgrade'
  options: {
    id: string
    name: string
    points: number
    count: number
    max: number
    description?: string | null
    keywordRules?: Datasheet['keywordRules']
  }[]
}

type LoadoutUnit = {
  entryId: string
  name: string
  points: number
  size: { min: number; max: number; models: number; resizable: boolean }
  toggles: { key: string; name: string; selected: boolean }[]
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
  onToggle: (key: string, name: string, selected: boolean) => void
  onResize: (models: number) => void
}

/**
 * What the selected unit is carrying.
 *
 * Two kinds of choice, because the data holds two. A group with room for one is an
 * either-or — a captain's relic blade or his power sword — and reads as a choice. A
 * group with room for more is the squad dividing itself, eight blasters and two
 * carbines, which a single answer cannot say; that one gets a count against each
 * option. Nothing is typed either way: every option and every price is the data's.
 */
export function Loadout({ catalogueId, unit, detachmentIds, picks, pickIndex, onChoose, onSpread, onToggle, onResize }: Props) {
  const [context, setContext] = useState({ detachmentIds, picks, pickIndex })
  useEffect(() => {
    const timeout = window.setTimeout(() => setContext({ detachmentIds, picks, pickIndex }), 150)
    return () => window.clearTimeout(timeout)
  }, [detachmentIds, picks, pickIndex])
  const { data: sheet } = useQuery({
    ...datasheetQuery(catalogueId, unit?.entryId ?? '', context.detachmentIds, context.picks, context.pickIndex),
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[2] === unit?.entryId ? previous : undefined),
  })
  const { data: availableSheet } = useQuery(datasheetQuery(catalogueId, unit?.entryId ?? '', detachmentIds))

  if (!unit) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="max-w-52 text-center text-xs text-faint">Select a unit from the roster to edit its loadout.</p>
      </div>
    )
  }
  if (!sheet || !availableSheet) return <LoadoutLoading />

  const ranged = sheet.profiles.filter((profile) => profile.type === 'Ranged Weapons')
  const melee = sheet.profiles.filter((profile) => profile.type === 'Melee Weapons')
  const availableWeapons = availableSheet.profiles.filter(
    (profile) => profile.type === 'Ranged Weapons' || profile.type === 'Melee Weapons',
  )
  const choiceWeaponNames = unit.choices.flatMap((choice) => choice.options.map((option) => option.name))
  const fixedRanged = ranged.filter((profile) => !choiceWeaponNames.some((name) => weaponMatches(name, profile.name)))
  const fixedMelee = melee.filter((profile) => !choiceWeaponNames.some((name) => weaponMatches(name, profile.name)))
  const rules = availableSheet.keywordRules

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-edge p-2.5">
        <h2 className="text-sm leading-tight">{unit.name}</h2>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className="chip">{unit.points} pts</span>
          {unit.size.resizable ? (
            <span className="grid grid-cols-[1.5rem_2rem_1.5rem] items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                className="size-6"
                aria-label={`Fewer models in ${unit.name}`}
                disabled={unit.size.models <= unit.size.min}
                onClick={() => onResize(unit.size.models - 1)}
              >
                <Minus />
              </Button>
              <span className="readout text-center text-sm tabular-nums" aria-label={`${unit.name} models`}>
                {unit.size.models}
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                className="size-6"
                aria-label={`More models in ${unit.name}`}
                disabled={unit.size.models >= unit.size.max}
                onClick={() => onResize(unit.size.models + 1)}
              >
                <Plus />
              </Button>
            </span>
          ) : null}
          {unit.toggles.map((toggle) => (
            <Toggle
              key={toggle.key}
              variant="outline"
              size="sm"
              aria-label={`${toggle.selected ? 'Remove' : 'Make'} ${unit.name} ${toggle.name}`}
              pressed={toggle.selected}
              className={
                toggle.selected
                  ? 'border-azure bg-azure/15 text-azure hover:bg-azure/20 hover:text-azure'
                  : 'border-edge-strong text-dim hover:border-azure hover:text-bone'
              }
              onPressedChange={(pressed) => onToggle(toggle.key, toggle.name, pressed)}
            >
              <Crown className={toggle.selected ? 'fill-current' : undefined} />
              {toggle.name}
              {toggle.selected ? <Check className="size-3.5" aria-hidden /> : null}
            </Toggle>
          ))}
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]]:p-2.5">
        <div className="space-y-4">
          {fixedRanged.length ? <WeaponSummary title="Equipped ranged weapons" weapons={fixedRanged} rules={rules} /> : null}
          {fixedMelee.length ? <WeaponSummary title="Equipped melee weapons" weapons={fixedMelee} rules={rules} /> : null}
          {unit.choices.length ? (
            <section>
              <p className="rubric flex items-baseline justify-between border-b border-edge pb-1.5">
                <span>Wargear options</span>
                <span className="readout">{unit.choices.length}</span>
              </p>
              <div className="mt-3 grid gap-5">
                {unit.choices.map((choice) =>
                  choice.kind
                    ? specialChoice(choice, onChoose, unit.name)
                    : choice.room > 1
                      ? spread(choice, onSpread, availableWeapons, availableSheet.abilities, rules)
                      : either(choice, onChoose, unit.name, availableWeapons, availableSheet.abilities, rules),
                )}
              </div>
            </section>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}

/** Waits for the complete loadout so its sections arrive together instead of in stages. */
function LoadoutLoading() {
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

function specialChoice(choice: LoadoutChoice, onChoose: Props['onChoose'], unitName: string) {
  const label = choice.kind === 'upgrade' ? 'upgrade' : 'enhancement'
  const heading = choice.kind === 'upgrade' ? 'Unit upgrades' : choice.name
  return (
    <fieldset key={choice.key} aria-label={`${unitName} ${heading}`} className="m-0 min-w-0 border-0">
      <legend className="eyebrow mb-1.5">{heading}</legend>
      <div className="space-y-1.5">
        {choice.optional ? (
          <button
            type="button"
            aria-pressed={!choice.chosen}
            onClick={() => onChoose(choice.key, '')}
            className={`flex w-full items-center justify-between border px-2.5 py-2 text-left text-xs font-semibold uppercase ${
              choice.chosen ? 'border-edge bg-card text-dim hover:border-dim hover:text-bone' : 'border-azure bg-azure/10 text-azure'
            }`}
          >
            No {label}
            {!choice.chosen ? <Check className="size-3.5" aria-hidden /> : null}
          </button>
        ) : null}
        {choice.options.map((option) => {
          const selected = choice.chosen === option.id
          return (
            <article
              key={option.id}
              className={`relative border ${selected ? 'border-azure bg-azure/10' : 'border-edge bg-card hover:border-dim'}`}
            >
              <button
                type="button"
                aria-pressed={selected}
                aria-label={`Select ${option.name}`}
                onClick={() => onChoose(choice.key, option.id)}
                className="absolute inset-0 z-0 w-full cursor-pointer hover:bg-raised"
              />
              <div className="pointer-events-none relative z-10 [&_button]:pointer-events-auto">
                <div className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left">
                  <span className="text-sm font-semibold text-bone">{option.name}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {option.points ? <span className="chip">+{option.points} pts</span> : null}
                    {selected ? <Check className="size-3.5 text-azure" aria-hidden /> : null}
                  </span>
                </div>
                {option.description ? (
                  <div className="border-t border-edge px-2.5 pb-2">
                    <RuleText text={option.description} rules={option.keywordRules} />
                  </div>
                ) : null}
              </div>
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
function spread(
  choice: LoadoutChoice,
  onSpread: Props['onSpread'],
  weapons: WeaponProfileData[],
  abilities: Datasheet['abilities'],
  rules: Datasheet['keywordRules'],
) {
  const taken = choice.options.reduce((total, option) => total + option.count, 0)
  const room = choice.room - taken

  const donor = (exclude: string) =>
    choice.options.filter((option) => option.id !== exclude && option.count > 0).toSorted((left, right) => right.count - left.count)[0]

  const more = (option: LoadoutChoice['options'][number]) => {
    if (option.count >= option.max) return null
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
          <li key={option.id} className={`border ${option.count ? 'border-azure bg-azure/10' : 'border-edge bg-card'}`}>
            <div className="flex items-center gap-2 px-2 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold">{option.name}</span>
                {option.points ? <span className="readout text-[0.6875rem] text-faint">+{option.points} each</span> : null}
              </span>
              <span className="grid shrink-0 grid-cols-[1.5rem_2rem_1.5rem] items-center gap-1">
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
                <span className="readout text-center text-sm tabular-nums" aria-label={`${option.name} count`}>
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
              </span>
            </div>
            <OptionProfiles optionName={option.name} weapons={weapons} rules={rules} />
            <OptionAbilities optionName={option.name} abilities={abilities} rules={rules} />
          </li>
        ))}
      </ul>
    </div>
  )
}

/** A group that holds one thing: which one. */
function either(
  choice: LoadoutChoice,
  onChoose: Props['onChoose'],
  unitName: string,
  weapons: WeaponProfileData[],
  abilities: Datasheet['abilities'],
  rules: Datasheet['keywordRules'],
) {
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
            None
            {!choice.chosen ? <Check className="size-3.5" aria-hidden /> : null}
          </button>
        ) : null}
        {choice.options.map((option) => {
          const selected = choice.chosen === option.id
          return (
            <article
              key={option.id}
              className={`relative border ${selected ? 'border-azure bg-azure/10' : 'border-edge bg-card hover:border-dim'}`}
            >
              <button
                type="button"
                aria-pressed={selected}
                aria-label={`Select ${option.name}`}
                onClick={() => onChoose(choice.key, option.id)}
                className="absolute inset-0 z-0 w-full cursor-pointer hover:bg-raised"
              />
              <div className="pointer-events-none relative z-10 [&_button]:pointer-events-auto">
                <div className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left">
                  <span className="text-sm font-semibold text-bone">{option.name}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {option.points ? <span className="chip">+{option.points} pts</span> : null}
                    {selected ? <Check className="size-3.5 text-azure" aria-hidden /> : null}
                  </span>
                </div>
                <OptionProfiles optionName={option.name} weapons={weapons} rules={rules} />
                <OptionAbilities optionName={option.name} abilities={abilities} rules={rules} />
                {option.description ? (
                  <div className="border-t border-edge px-2.5 pb-2">
                    <RuleText text={option.description} rules={option.keywordRules ?? rules} />
                  </div>
                ) : null}
              </div>
            </article>
          )
        })}
      </div>
    </fieldset>
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
          {ability.description ? <RuleText text={ability.description} rules={rules} /> : null}
        </div>
      ))}
    </div>
  ) : null
}

type WeaponProfileData = Datasheet['profiles'][number]

function OptionProfiles({
  optionName,
  weapons,
  rules,
}: {
  optionName: string
  weapons: WeaponProfileData[]
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

function weaponMatches(optionName: string, profileName: string) {
  const option = optionName.trim().toLocaleLowerCase()
  const profile = profileName.trim().toLocaleLowerCase()
  return profile === option || profile.startsWith(`${option} (`) || option.includes(profile)
}

function wargearMatches(optionName: string, abilityName: string) {
  const option = optionName.trim().toLocaleLowerCase()
  const ability = abilityName.trim().toLocaleLowerCase()
  return ability === option || ability.startsWith(`${option} (`) || option.includes(ability)
}
