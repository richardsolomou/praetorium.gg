import { createContext, useContext, type ReactNode } from 'react'
import { datasheetCharacteristicKindOf, invulnerableSaveOf, statlineValues } from '../../core/datasheetStructure'
import type { Datasheet } from '../../contracts/catalogue'
import { HoverTooltip } from './HoverTooltip'
import { KeywordList } from './Keyword'
import { addedKeywords, weaponProfileGroupName, weaponProfileGroups, weaponProfileMode } from '../datasheet'

type Profile = Datasheet['profiles'][number]

/** `invulnerable` false leaves the save to `InvulnerableSaves`, which shows VS Data's. */
export function UnitProfile({ profile, invulnerable: showInvulnerable = true }: { profile: Profile; invulnerable?: boolean }) {
  const invulnerable = showInvulnerable ? invulnerableSaveOf(profile.values) : undefined
  const values = statlineValues(profile.values)
  return (
    <section data-slot="unit-profile">
      <ProfileGrid values={values} />
      {invulnerable ? (
        <div className="flex items-center justify-between border-b border-edge px-2 py-2">
          <span className="text-xs font-bold uppercase">Invulnerable save</span>
          <span className="readout text-base">
            <ProfileValue value={invulnerable} />
          </span>
        </div>
      ) : null}
    </section>
  )
}

export function ProfileGrid({ values, columns = 6 }: { values: readonly DisplayValue[]; columns?: 5 | 6 }) {
  return (
    <div
      data-slot="profile-grid"
      className={`grid ${columns === 5 ? 'grid-cols-5' : 'grid-cols-6'} divide-x divide-edge border-y border-edge`}
    >
      {values.map((value) => (
        <div key={value.name} data-characteristic={value.name} className="min-w-0 px-1 py-2 text-center">
          <p className="eyebrow">{value.name}</p>
          <p className="readout mt-0.5 text-base">
            <ProfileValue value={value} />
          </p>
        </div>
      ))}
    </div>
  )
}

/** How a battle reads a weapon, given every profile it has: carried by nobody standing, or held by the models a player asked to see. */
export type WeaponMark = (profiles: readonly Profile[]) => { fallen: boolean; sought: boolean; left?: number }

export function WeaponSummary({
  title,
  weapons,
  rules,
  mark,
}: {
  title: string
  weapons: Profile[]
  rules: Datasheet['keywordRules']
  mark?: WeaponMark
}) {
  const count = weaponProfileGroups(weapons).reduce((total, profiles) => total + carried(profiles[0]!, mark?.(profiles)), 0)
  return (
    <section>
      <h2 className="rubric flex items-baseline justify-between">
        <span>{title}</span>
        <span className="readout text-faint">{count}</span>
      </h2>
      <div className="mt-2 border-t border-edge">
        <WeaponProfiles weapons={weapons} rules={rules} mark={mark} />
      </div>
    </section>
  )
}

export function WeaponProfiles({
  weapons,
  rules,
  showName = true,
  showCount = true,
  embedded = false,
  mark,
}: {
  weapons: readonly Profile[]
  rules: Datasheet['keywordRules']
  showName?: boolean
  showCount?: boolean
  embedded?: boolean
  mark?: WeaponMark
}) {
  return weaponProfileGroups(weapons).map((profiles) => {
    const first = profiles[0]!
    const state = mark?.(profiles)
    if (profiles.length === 1) {
      return (
        <WeaponProfile
          key={first.id}
          weapon={first}
          rules={rules}
          showName={showName}
          showCount={showCount}
          embedded={embedded}
          state={state}
        />
      )
    }
    const name = weaponProfileGroupName(profiles)
    return (
      <section
        key={first.id}
        aria-label={`${name} profiles`}
        {...marked(state)}
        className={`${embedded ? 'mx-2 my-1.5' : 'border-b border-edge px-2 py-2.5'} scroll-mt-2.5 ${state?.fallen ? 'opacity-50' : ''}`}
      >
        <h3 className="flex items-baseline justify-between gap-2 text-xs">
          {showName ? (
            <span className={state?.fallen ? 'line-through' : undefined}>
              {showCount && carried(first, state) > 1 ? `${carried(first, state)}× ${name}` : name}
            </span>
          ) : null}
          <span className="shrink-0 font-rules font-normal normal-case text-faint">{profiles.length} profiles</span>
        </h3>
        <div className="mt-1 ml-3 border-l-2 border-runner pl-3">
          {profiles.map((weapon) => (
            <WeaponProfile
              key={weapon.id}
              weapon={weapon}
              rules={rules}
              label={weaponProfileMode(weapon, profiles)}
              showCount={false}
              embedded
            />
          ))}
        </div>
      </section>
    )
  })
}

/** How many of a weapon the unit carries, or in a battle, how many its models still standing do. */
const carried = (weapon: Profile, state?: ReturnType<WeaponMark>) => state?.left ?? weapon.count ?? 1

const marked = (state?: ReturnType<WeaponMark>) => ({
  'data-fallen': state?.fallen || undefined,
  'data-sought': state?.sought || undefined,
})

/** Something to say under a weapon profile, such as its odds in a combat simulation; most screens say nothing. */
export const WeaponProfileNote = createContext<((weapon: Profile) => ReactNode) | null>(null)

function WeaponProfile({
  weapon,
  rules,
  label,
  showName = true,
  showCount = true,
  embedded = false,
  state,
}: {
  weapon: Profile
  rules: Datasheet['keywordRules']
  label?: string
  showName?: boolean
  showCount?: boolean
  embedded?: boolean
  state?: ReturnType<WeaponMark>
}) {
  const keywords = weapon.values.find((value) => datasheetCharacteristicKindOf(value) === 'keywords')
  const keywordText = keywords?.value.trim()
  const note = useContext(WeaponProfileNote)?.(weapon)
  return (
    <div
      {...marked(state)}
      className={`${embedded ? 'py-1.5' : 'border-b border-edge py-2.5'} scroll-mt-2.5 px-2 ${state?.fallen ? 'opacity-50' : ''}`}
    >
      {showName ? (
        <h3
          className={`${label ? 'font-rules text-xs font-medium normal-case text-dim' : 'text-xs'} ${state?.fallen ? 'line-through' : ''}`}
        >
          {showCount && carried(weapon, state) > 1 ? `${carried(weapon, state)}× ${weapon.name}` : (label ?? weapon.name)}
        </h3>
      ) : null}
      {note}
      <div className={`${showName ? 'mt-1 ' : ''}flex flex-wrap gap-1`}>
        {weapon.values
          .filter((value) => datasheetCharacteristicKindOf(value) !== 'keywords')
          .map((value) => (
            <div key={value.name} className="flex-1 text-center">
              <p className="eyebrow">{value.name}</p>
              <p className="readout text-base text-bone">
                <ProfileValue value={value} />
              </p>
            </div>
          ))}
      </div>
      {keywordText && keywordText !== '-' && keywordText !== '—' ? (
        <p className="mt-1 text-xs text-bone">
          <KeywordList value={keywordText} rules={rules} added={addedKeywords(keywords!)} note={addedBy(keywords!)} />
        </p>
      ) : null}
    </div>
  )
}

type DisplayValue = Profile['values'][number]

/** What put a keyword on a weapon, in the words the tooltip footer says it in. */
const addedBy = (keywords: DisplayValue) => (keywords.modifiers?.length ? `Added by ${keywords.modifiers.join(', ')}` : undefined)

function ProfileValue({ value }: { value: DisplayValue }) {
  if (value.baseValue === undefined || !value.modifiers?.length) return value.value
  const sources = value.modifiers.join(', ')
  const name = datasheetCharacteristicKindOf(value) === 'invulnerable-save' ? 'Invulnerable save' : value.name
  const baseValue = value.baseValue || '—'
  return (
    <HoverTooltip
      className="font-semibold text-info"
      label={`${name} ${value.value}, modified from ${baseValue} by ${sources}`}
      title={`Modified ${name}`}
      body={
        <>
          {baseValue} → <span className="text-info">{value.value}</span>
        </>
      }
      note={`Modified by ${sources}`}
    >
      {value.value}
    </HoverTooltip>
  )
}
