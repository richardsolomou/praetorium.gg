import { wargearBaseName } from '../../core/wargear'
import { datasheetCharacteristicKindOf } from '../../core/datasheetStructure'
import type { Datasheet } from '../../contracts/catalogue'
import { HoverTooltip } from './HoverTooltip'
import { KeywordList } from './Keyword'
import { addedKeywords, weaponProfileGroups, weaponProfileMode } from '../datasheet'

type Profile = Datasheet['profiles'][number]

export function UnitProfile({ profile }: { profile: Profile }) {
  const invulnerable = profile.values.find((value) => datasheetCharacteristicKindOf(value) === 'invulnerable-save')
  const values = profile.values.filter((value) => datasheetCharacteristicKindOf(value) !== 'invulnerable-save')
  return (
    <section data-slot="unit-profile">
      <ProfileGrid values={values} />
      {invulnerable ? (
        <div className="mt-1.5 flex items-center justify-between border border-edge bg-card px-2 py-1.5">
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
    <div data-slot="profile-grid" className={`grid ${columns === 5 ? 'grid-cols-5' : 'grid-cols-6'} gap-1`}>
      {values.map((value) => (
        <div key={value.name} data-characteristic={value.name} className="min-w-0 border border-edge bg-card px-2 py-1.5 text-center">
          <p className="eyebrow">{value.name}</p>
          <p className="readout mt-0.5 text-base">
            <ProfileValue value={value} />
          </p>
        </div>
      ))}
    </div>
  )
}

export function WeaponSummary({ title, weapons, rules }: { title: string; weapons: Profile[]; rules: Datasheet['keywordRules'] }) {
  const count = weaponProfileGroups(weapons).reduce((total, profiles) => total + (profiles[0]?.count ?? 1), 0)
  return (
    <section>
      <h2 className="rubric flex items-baseline justify-between">
        <span>{title}</span>
        <span className="readout text-faint">{count}</span>
      </h2>
      <div className="mt-2 space-y-1.5">
        <WeaponProfiles weapons={weapons} rules={rules} />
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
}: {
  weapons: readonly Profile[]
  rules: Datasheet['keywordRules']
  showName?: boolean
  showCount?: boolean
  embedded?: boolean
}) {
  return weaponProfileGroups(weapons).map((profiles) => {
    const first = profiles[0]!
    if (profiles.length === 1) {
      return <WeaponProfile key={first.id} weapon={first} rules={rules} showName={showName} showCount={showCount} embedded={embedded} />
    }
    const name = wargearBaseName(first.name)
    return (
      <section key={first.id} aria-label={`${name} profiles`} className={embedded ? 'mx-2 my-1.5' : 'border border-edge bg-card p-2'}>
        <h3 className="flex items-baseline justify-between gap-2 text-xs">
          {showName ? <span>{showCount && first.count && first.count > 1 ? `${first.count}× ${name}` : name}</span> : null}
          <span className="shrink-0 font-rules font-normal normal-case text-faint">{profiles.length} profiles</span>
        </h3>
        <div className="mt-1 ml-3 border-l-2 border-edge-strong pl-3">
          {profiles.map((weapon) => (
            <WeaponProfile key={weapon.id} weapon={weapon} rules={rules} label={weaponProfileMode(weapon)} showCount={false} embedded />
          ))}
        </div>
      </section>
    )
  })
}

export function WeaponProfile({
  weapon,
  rules,
  label,
  showName = true,
  showCount = true,
  embedded = false,
}: {
  weapon: Profile
  rules: Datasheet['keywordRules']
  label?: string
  showName?: boolean
  showCount?: boolean
  embedded?: boolean
}) {
  const keywords = weapon.values.find((value) => datasheetCharacteristicKindOf(value) === 'keywords')
  const keywordText = keywords?.value.trim()
  return (
    <div className={`${embedded ? '' : 'border border-edge bg-card '}px-2 py-1.5`}>
      {showName ? (
        <h3 className={label ? 'font-rules text-xs font-medium normal-case text-dim' : 'text-xs'}>
          {showCount && weapon.count && weapon.count > 1 ? `${weapon.count}× ${weapon.name}` : (label ?? weapon.name)}
        </h3>
      ) : null}
      <div className={`${showName ? 'mt-1 ' : ''}grid grid-cols-6 gap-1`}>
        {weapon.values
          .filter((value) => datasheetCharacteristicKindOf(value) !== 'keywords')
          .map((value) => (
            <div key={value.name} className="min-w-0 text-center">
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
