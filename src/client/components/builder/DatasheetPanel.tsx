import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { RosterPick } from '../../../core/roster'
import type { Datasheet } from '../../../server/catalogue'
import { compositionCount } from '../../datasheet'
import { datasheetQuery } from '../../queries'
import { HoverTooltip } from '../HoverTooltip'
import { Keyword, KEYWORD_TAG_CLASS, KeywordList } from '../Keyword'
import { RuleText } from '../RuleText'

type Props = {
  catalogueId: string
  entryId: string | null
  detachmentIds: readonly string[]
  picks: readonly RosterPick[]
  pickIndex: number | null
  showWeapons?: boolean
}

export function DatasheetPanel({ catalogueId, entryId, detachmentIds, picks, pickIndex, showWeapons = false }: Props) {
  const [context, setContext] = useState({ detachmentIds, picks, pickIndex })
  useEffect(() => {
    const timeout = window.setTimeout(() => setContext({ detachmentIds, picks, pickIndex }), 150)
    return () => window.clearTimeout(timeout)
  }, [detachmentIds, picks, pickIndex])
  const { data: sheet } = useQuery({
    ...datasheetQuery(catalogueId, entryId ?? '', context.detachmentIds, context.picks, context.pickIndex),
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[2] === entryId ? previous : undefined),
  })

  if (!entryId) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="max-w-52 text-center text-xs text-faint">Select a unit to see its datasheet.</p>
      </div>
    )
  }
  if (!sheet) return <DatasheetLoading />

  const model = sheet.profiles.find((profile) => profile.type === 'Unit')
  const ranged = sheet.profiles.filter((profile) => profile.type === 'Ranged Weapons')
  const melee = sheet.profiles.filter((profile) => profile.type === 'Melee Weapons')
  return (
    <ScrollArea className="h-full [&_[data-slot=scroll-area-viewport]]:p-3">
      <div className="space-y-4">
        <header className="border-b border-edge pb-3">
          <p className="eyebrow">Datasheet</p>
          <div className="mt-0.5 flex flex-wrap items-start justify-between gap-2">
            <h2 className="min-w-0 flex-1 text-xl">{sheet.name}</h2>
            <div className="flex shrink-0 flex-wrap justify-end gap-1">
              {sheet.composition.length ? <span className="chip">{compositionCount(sheet.composition)}</span> : null}
              {sheet.points === null ? null : <span className="chip">{sheet.points} pts</span>}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {sheet.keywords.map((keyword) => (
              <Keyword key={keyword} name={keyword} rules={sheet.keywordRules} className={KEYWORD_TAG_CLASS} />
            ))}
          </div>
        </header>
        {model ? <UnitProfile profile={model} /> : null}
        {showWeapons && ranged.length ? <WeaponSummary title="Ranged weapons" weapons={ranged} rules={sheet.keywordRules} /> : null}
        {showWeapons && melee.length ? <WeaponSummary title="Melee weapons" weapons={melee} rules={sheet.keywordRules} /> : null}
        <AbilitySummary abilities={sheet.abilities} rules={sheet.keywordRules} />
      </div>
    </ScrollArea>
  )
}

/** Holds the pane's visual rhythm while a different datasheet is fetched. */
function DatasheetLoading() {
  return (
    <output className="block space-y-4 p-3" aria-label="Loading datasheet">
      <div className="flex gap-1">
        <span className="h-5 w-16 animate-pulse bg-raised" />
        <span className="h-5 w-24 animate-pulse bg-raised" />
      </div>
      <div className="grid grid-cols-6 gap-2">
        {Array.from({ length: 6 }, (_, index) => (
          <span key={index} className="h-10 animate-pulse bg-raised" />
        ))}
      </div>
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="space-y-2 border-t border-edge pt-2">
          <span className="block h-3 w-28 animate-pulse bg-raised" />
          <span className="block h-20 animate-pulse bg-card" />
        </div>
      ))}
      <span className="sr-only">Loading datasheet…</span>
    </output>
  )
}

type Profile = Datasheet['profiles'][number]

function UnitProfile({ profile }: { profile: Profile }) {
  const invulnerable = profile.values.find((value) => value.name === 'InSv')?.value
  const values = profile.values.filter((value) => value.name !== 'InSv')
  return (
    <section data-slot="unit-profile">
      <div className="grid grid-cols-3 gap-1.5">
        {values.map((value) => (
          <div key={value.name} className="border border-edge bg-card px-2 py-1.5 text-center">
            <p className="eyebrow">{value.name}</p>
            <p className="readout mt-0.5 text-base">
              <ProfileValue value={value} />
            </p>
          </div>
        ))}
      </div>
      {invulnerable ? (
        <div className="mt-1.5 flex items-center justify-between border border-edge bg-card px-2 py-1.5">
          <span className="text-xs font-bold uppercase">Invulnerable save</span>
          <span className="readout text-base">{invulnerable}</span>
        </div>
      ) : null}
    </section>
  )
}

export function WeaponSummary({ title, weapons, rules }: { title: string; weapons: Profile[]; rules: Datasheet['keywordRules'] }) {
  const count = weapons.reduce((total, weapon) => total + (weapon.count ?? 1), 0)
  return (
    <section>
      <h2 className="rubric flex items-baseline justify-between">
        <span>{title}</span>
        <span className="readout text-faint">{count}</span>
      </h2>
      <div className="mt-2 space-y-1.5">
        {weapons.map((weapon) => (
          <WeaponProfile key={weapon.id} weapon={weapon} rules={rules} />
        ))}
      </div>
    </section>
  )
}

export function WeaponProfile({
  weapon,
  rules,
  showName = true,
  embedded = false,
}: {
  weapon: Profile
  rules: Datasheet['keywordRules']
  showName?: boolean
  embedded?: boolean
}) {
  return (
    <div className={`${embedded ? '' : 'border border-edge bg-card '}px-2 py-1.5`}>
      {showName ? <h3 className="text-xs">{weapon.count && weapon.count > 1 ? `${weapon.count}× ${weapon.name}` : weapon.name}</h3> : null}
      <div className={`${showName ? 'mt-1 ' : ''}grid grid-cols-6 gap-1`}>
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
        <p className="mt-1 text-xs text-bone">
          <KeywordList value={weapon.values.find((value) => value.name === 'Keywords')!.value} rules={rules} />
        </p>
      ) : null}
    </div>
  )
}

const ABILITY_SECTIONS = [
  { kind: 'core', title: 'Core abilities' },
  { kind: 'faction', title: 'Faction abilities' },
  { kind: 'datasheet', title: 'Datasheet abilities' },
  { kind: 'rule', title: 'Rules' },
  { kind: 'wargear', title: 'Wargear abilities' },
] as const

function AbilitySummary({ abilities, rules }: { abilities: Datasheet['abilities']; rules: Datasheet['keywordRules'] }) {
  return ABILITY_SECTIONS.map(({ kind, title }) => {
    const found = abilities.filter((ability) => ability.kind === kind)
    if (!found.length) return null
    if (kind === 'core' || kind === 'faction') {
      const described = [
        ...found.flatMap((ability) => (ability.description ? [{ name: ability.name, description: ability.description }] : [])),
        ...rules,
      ]
      return (
        <section key={kind}>
          <h2 className="rubric">
            {title} <span className="readout text-faint">{found.length}</span>
          </h2>
          <div className="mt-2 flex flex-wrap gap-1">
            {found.map((ability) => (
              <Keyword key={ability.id} name={ability.name} rules={described} className={KEYWORD_TAG_CLASS} />
            ))}
          </div>
        </section>
      )
    }
    return (
      <section key={kind}>
        <h2 className="rubric">
          {title} <span className="readout text-faint">{found.length}</span>
        </h2>
        <div className="mt-2 space-y-1.5">
          {found.map((ability) => (
            <article key={ability.id} className="border border-edge bg-card px-2 py-1.5">
              <h3 className="text-xs">{ability.source ?? ability.name}</h3>
              {ability.source ? <p className="eyebrow mt-1">{ability.name}</p> : null}
              {ability.description ? <RuleText text={ability.description} rules={rules} /> : null}
            </article>
          ))}
        </div>
      </section>
    )
  })
}

type DisplayValue = Profile['values'][number]

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
