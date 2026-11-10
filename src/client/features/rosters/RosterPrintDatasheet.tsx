import type { Datasheet } from '../../../contracts/catalogue'
import {
  datasheetCharacteristicKindOf,
  datasheetProfilesByKind,
  invulnerableSaveOf,
  statlineValues,
} from '../../../core/datasheetStructure'
import { RuleText } from '../../components/RuleText'
import { unitKeywordsText } from '../../components/Keyword'
import { ruleProfileSections, weaponProfileGroups, weaponShapedProfile } from '../../datasheet'

type Profile = Datasheet['profiles'][number]

/** Rules text at the pack's own size, since the screen's sets it larger and spaced for reading. */
export const PRINTED_RULE = 'mt-0 space-y-1 text-[length:inherit] leading-[inherit]'

const shownValue = (value: Profile['values'][number]) => value.value.trim() || '—'
const keywordsOf = (profile: Profile) => {
  const text = profile.values.find((value) => datasheetCharacteristicKindOf(value) === 'keywords')?.value.trim()
  return text && text !== '-' && text !== '—' ? text : ''
}
// Multi-profile weapons carry their mode in the name, after a leading marker the datacards use for indentation.
const weaponName = (weapon: Profile) => weapon.name.replace(/^[^\p{L}\p{N}]+/u, '')
const statsOf = (profile: Profile) => profile.values.filter((value) => datasheetCharacteristicKindOf(value) !== 'keywords')

/**
 * One datasheet as a printed table rather than the screen's cards: statlines, then every equipped weapon on one row
 * each, then the unit's own abilities. Core and faction abilities are only named, since the pack prints them once.
 */
export function RosterPrintDatasheet({ sheet }: { sheet: Datasheet }) {
  const { unit, ranged, melee } = datasheetProfilesByKind(sheet)
  const own = sheet.abilities.filter((ability) => ability.kind !== 'core' && ability.kind !== 'faction')
  const shared = sheet.abilities.filter((ability) => ability.kind === 'core' || ability.kind === 'faction')
  const extras = ruleProfileSections(sheet.profiles)

  return (
    <>
      {unit.length ? <StatTable profiles={unit} /> : null}
      {ranged.length || melee.length ? (
        <table className="pack-weapons">
          <thead>
            <tr>
              <th scope="col">Weapon</th>
              {['Range', 'A', 'BS/WS', 'S', 'AP', 'D'].map((name) => (
                <th scope="col" key={name}>
                  {name}
                </th>
              ))}
              <th scope="col">Keywords</th>
            </tr>
          </thead>
          <WeaponRows label="Ranged" weapons={ranged} />
          <WeaponRows label="Melee" weapons={melee} />
        </table>
      ) : null}
      {own.length || shared.length || extras.length ? (
        <dl className="pack-abilities">
          {own.map((ability) => (
            <div key={ability.id}>
              <dt>
                {ability.name}
                {ability.source ? ` (${ability.source})` : ''}
              </dt>
              <dd>
                {ability.description ? <RuleText text={ability.description} className={PRINTED_RULE} /> : 'No description is available.'}
              </dd>
            </div>
          ))}
          {extras.flatMap((section) =>
            section.profiles.map((profile) => (
              <div key={profile.id}>
                <dt>{profile.name === section.title ? profile.name : `${section.title}: ${profile.name}`}</dt>
                <dd>
                  {weaponShapedProfile(profile)
                    ? statsOf(profile)
                        .map((value) => `${value.name} ${shownValue(value)}`)
                        .join(' · ')
                    : profile.values.map((value) => <RuleText key={value.name} text={value.value} className={PRINTED_RULE} />)}
                </dd>
              </div>
            )),
          )}
          {shared.length ? (
            <div>
              <dt>Shared abilities</dt>
              <dd>{shared.map((ability) => ability.name).join(', ')}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      <p className="pack-keywords">
        <span>Keywords</span> {unitKeywordsText(sheet)}
      </p>
    </>
  )
}

/** Every unit profile in one table, named only when the datasheet has more than one, with an invulnerable save column if any has one. */
function StatTable({ profiles }: { profiles: Profile[] }) {
  const shown = (profile: Profile) => statlineValues(profile.values)
  const invulnerable = (profile: Profile) => invulnerableSaveOf(profile.values)
  const columns = shown(profiles[0]!).map((value) => value.name)
  const anyInvulnerable = profiles.some(invulnerable)
  const named = profiles.length > 1
  return (
    <table className="pack-stats">
      <thead>
        <tr>
          {named ? <th scope="col">Model</th> : null}
          {columns.map((name) => (
            <th scope="col" key={name}>
              {name}
            </th>
          ))}
          {anyInvulnerable ? <th scope="col">Inv</th> : null}
        </tr>
      </thead>
      <tbody>
        {profiles.map((profile) => {
          const save = invulnerable(profile)
          return (
            <tr key={profile.id}>
              {named ? <th scope="row">{profile.name}</th> : null}
              {shown(profile).map((value) => (
                <td key={value.name}>{shownValue(value)}</td>
              ))}
              {anyInvulnerable ? <td>{save ? shownValue(save) : '—'}</td> : null}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function WeaponRows({ label, weapons }: { label: string; weapons: Profile[] }) {
  if (!weapons.length) return null
  return (
    <tbody>
      <tr className="pack-weapon-kind">
        <th scope="rowgroup" colSpan={8}>
          {label}
        </th>
      </tr>
      {weaponProfileGroups(weapons).flatMap((profiles) => {
        const first = profiles[0]!
        const count = first.count && first.count > 1 ? `${first.count}× ` : ''
        return profiles.map((weapon) => (
          <tr key={weapon.id}>
            <th scope="row">
              {count}
              {weaponName(weapon)}
            </th>
            {statsOf(weapon).map((value) => (
              <td key={value.name}>{shownValue(value)}</td>
            ))}
            <td>{keywordsOf(weapon)}</td>
          </tr>
        ))
      })}
    </tbody>
  )
}
