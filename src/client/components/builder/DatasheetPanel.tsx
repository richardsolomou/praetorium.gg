import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { RosterPick } from '../../../core/roster'
import type { Datasheet } from '../../../server/catalogue'
import { datasheetQuery } from '../../queries'
import { HoverTooltip } from '../HoverTooltip'
import { Keyword, KeywordList } from '../Keyword'
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
  if (!sheet) return null

  const model = sheet.profiles.find((profile) => profile.type === 'Unit')
  const ranged = sheet.profiles.filter((profile) => profile.type === 'Ranged Weapons')
  const melee = sheet.profiles.filter((profile) => profile.type === 'Melee Weapons')
  return (
    <ScrollArea className="h-full [&_[data-slot=scroll-area-viewport]]:p-3">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1">
          {sheet.keywords.map((keyword) => (
            <Keyword key={keyword} name={keyword} rules={sheet.keywordRules} className="chip" />
          ))}
        </div>
        {model ? <UnitProfile profile={model} /> : null}
        {showWeapons && ranged.length ? <WeaponSummary title="Ranged weapons" weapons={ranged} rules={sheet.keywordRules} /> : null}
        {showWeapons && melee.length ? <WeaponSummary title="Melee weapons" weapons={melee} rules={sheet.keywordRules} /> : null}
        <AbilitySummary abilities={sheet.abilities} rules={sheet.keywordRules} />
      </div>
    </ScrollArea>
  )
}

type Profile = Datasheet['profiles'][number]

function UnitProfile({ profile }: { profile: Profile }) {
  return (
    <div
      data-slot="unit-profile"
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${profile.values.length}, minmax(0, 1fr))` }}
    >
      {profile.values.map((value) => (
        <div key={value.name} className="text-center">
          <p className="eyebrow">{value.name}</p>
          <p className="readout text-sm">
            <ProfileValue value={value} />
          </p>
        </div>
      ))}
    </div>
  )
}

export function WeaponSummary({ title, weapons, rules }: { title: string; weapons: Profile[]; rules: Datasheet['keywordRules'] }) {
  const count = weapons.reduce((total, weapon) => total + (weapon.count ?? 1), 0)
  return (
    <section>
      <p className="eyebrow flex items-baseline justify-between border-b border-edge pb-1">
        <span>{title}</span>
        <span className="readout">{count}</span>
      </p>
      <div className="mt-1.5 space-y-1.5">
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
        <p className="mt-1 text-[0.6875rem] text-faint">
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
          <p className="eyebrow border-b border-edge pb-1">{title}</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {found.map((ability) => (
              <Keyword key={ability.id} name={ability.name} rules={described} className="chip" />
            ))}
          </div>
        </section>
      )
    }
    return (
      <section key={kind}>
        <p className="eyebrow flex items-baseline justify-between border-b border-edge pb-1">
          <span>{title}</span>
          <span className="readout">{found.length}</span>
        </p>
        <div className="mt-1.5 space-y-1.5">
          {found.map((ability) => (
            <article key={ability.id} className="border border-edge bg-card px-2 py-1.5">
              <h3 className="text-xs">{ability.name}</h3>
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
