import { useReferenceFaction } from './useReferenceFaction'
import { FactionReferenceLink } from '../../../components/FactionReferenceLink'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { FactionBreadcrumb } from './FactionBreadcrumb'
import { datasheetCharacteristicKindOf, datasheetProfileKindOf, datasheetProfilesByKind } from '../../../../core/datasheetStructure'
import type { Datasheet, DatasheetCharacteristicKind, StructuredDatasheetProfile } from '../../../../contracts/catalogue'
import {
  abilitySections,
  attachmentGroups,
  profileTableColumns,
  profileTableValue,
  referenceAbilities,
  separateTransport,
  weaponProfileGroupName,
  weaponProfileGroups,
  weaponProfileMode,
} from '../../../datasheet'
import { datasheetSlugQuery, referenceChangesQuery } from '../../../queries'
import { changeDetail } from '../../../catalogueChanges'
import { useDateFormatting } from '../../../dates'
import { FactionMark, factionColour } from '../../../components/FactionMark'
import { DatasheetAddMenu } from './DatasheetAddMenu'
import { AddToRoster } from '../../rosters/ReferenceRosterActions'
import { DatasheetPhotos } from './DatasheetPhotos'
import { SimulateDatasheet } from '../../simulator/SimulateDatasheet'
import { Keyword, KEYWORD_TAG_CLASS, KeywordList, type KeywordRule, UnitKeywords } from '../../../components/Keyword'
import { ProfileRules } from '../../rosters/ProfileRules'
import { RuleText } from '../../../components/RuleText'
import { PageContent, PageHeader } from '../../../components/Page'
import type { OnboardingTarget } from '../../../onboardingTargets'
import { groupBy } from '../../../../core/collections'
import { SectionHeading } from '../../../components/SectionHeading'

export function FactionDatasheet() {
  const params = useParams({ strict: false })
  const faction = useReferenceFaction()
  const { data: sheet } = useQuery(datasheetSlugQuery(faction?.id ?? '', params.entryId ?? ''))
  if (!sheet || !faction) return null
  const structured = datasheetProfilesByKind(sheet)
  const unitGroups = characteristicProfileGroups(structured.unit)
  const unit = unitGroups.map((group) => group[0]!)
  const unitAnchorIds = new Map(unitGroups.map((group) => [group[0]!.id, group.map((profile) => profile.id)]))
  const invulnerable = unit.flatMap((profile) => {
    const value = profile.values.find((characteristic) => datasheetCharacteristicKindOf(characteristic) === 'invulnerable-save')?.value
    return value ? [{ name: profile.name, value }] : []
  })
  const ranged = structured.ranged
  const melee = structured.melee
  const abilities = referenceAbilities(sheet.abilities, sheet.attachments)
  const visibleAbilityIds = new Set(abilities.map((ability) => ability.id))
  const relationshipAbilityIds = sheet.abilities.filter((ability) => !visibleAbilityIds.has(ability.id)).map((ability) => ability.id)

  return (
    <main id="summary" className="w-full">
      <PageHeader
        tint={factionColour(faction.slug, faction.displayName)}
        eyebrow={`${faction.displayName} · Datasheet`}
        title={sheet.name}
        media={<FactionMark faction={faction} />}
        actions={
          <div className="flex flex-wrap items-center gap-1">
            <AddToRoster faction={faction} entryId={sheet.id} name={sheet.name} />
            <DatasheetAddMenu entryId={sheet.id} name={sheet.name} />
            <SimulateDatasheet catalogueId={faction.id} entryId={sheet.id} />
          </div>
        }
      >
        {sheet.modelCount || sheet.points !== null ? (
          <div className="flex flex-wrap gap-1">
            {sheet.modelCount ? <span className="chip">{sheet.modelCount}</span> : null}
            {sheet.points === null ? null : <span className="chip text-info">{sheet.points} pts</span>}
          </div>
        ) : null}
        <UnitKeywords id="keyword-rules" className="mt-2" sheet={sheet} />
      </PageHeader>
      <PageContent className="space-y-6">
        <FactionBreadcrumb faction={faction} datasheets />

        {unit.length === 1 && unit[0] ? <UnitCharacteristics profile={unit[0]} anchorIds={unitAnchorIds.get(unit[0].id)} /> : null}
        {unit.length > 1 ? (
          <ProfileTable
            title="Models"
            profiles={unit}
            omit={['invulnerable-save', 'base-size']}
            keywordRules={sheet.keywordRules}
            anchorIds={unitAnchorIds}
          />
        ) : null}
        {unit.length > 1 && invulnerable.length ? (
          <section>
            <SectionHeading title="Invulnerable save" />
            <div className="flex flex-wrap gap-2">
              {invulnerable.map((profile) => (
                <div key={profile.name} className="border border-edge bg-panel px-3 py-2">
                  <span className="text-sm font-semibold">{profile.name}</span>
                  <span className="readout ml-3 text-dim">{profile.value}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        {ranged.length ? <ProfileTable title="Ranged weapons" profiles={ranged} keywordRules={sheet.keywordRules} /> : null}
        {melee.length ? <ProfileTable title="Melee weapons" profiles={melee} keywordRules={sheet.keywordRules} /> : null}
        <Abilities abilities={abilities} rules={sheet.keywordRules} />
        <ProfileRules profiles={sheet.profiles} rules={sheet.keywordRules} />
        <UnitConfiguration sheet={sheet} rules={sheet.keywordRules} />
        <PointsChanges faction={faction} slug={sheet.slug} />
        <TransportReference transport={sheet.transport} profiles={structured.transport} abilities={abilities} rules={sheet.keywordRules} />
        <Relationships sheet={sheet} abilityIds={relationshipAbilityIds} />
        <DatasheetPhotos entryId={sheet.id} name={sheet.name} />
      </PageContent>
    </main>
  )
}

type DisplayAbility = Datasheet['abilities'][number]
const noAnchorIds: readonly string[] = []

export function Abilities({
  abilities,
  rules,
  onboarding,
}: {
  abilities: DisplayAbility[]
  rules: KeywordRule[]
  onboarding?: OnboardingTarget
}) {
  return Object.entries(abilitySections).map(([kind, title]) => {
    const found = abilities.filter((ability) => ability.kind === kind)
    if (!found.length) return null
    const cards = (
      <div className="grid gap-2 md:grid-cols-2">
        {found.map((ability) => (
          <article id={`ability-${ability.id}`} key={ability.id} className="border border-edge bg-panel p-3">
            <h3 className="text-sm">{ability.source ?? ability.name}</h3>
            {ability.source ? <p className="eyebrow mt-1">{ability.name}</p> : null}
            {ability.description ? <RuleText text={ability.description} rules={rules} /> : null}
          </article>
        ))}
      </div>
    )
    if (kind === 'core' || kind === 'faction') {
      return (
        <section key={kind} data-onboarding={onboarding}>
          <SectionHeading title={title} count={found.length} />
          <div className="flex flex-wrap gap-1">
            {found.map((ability) => (
              <span id={`ability-${ability.id}`} key={ability.id} className="scroll-mt-header">
                <Keyword
                  name={ability.name}
                  rules={ability.description ? [{ name: ability.name, description: ability.description }] : []}
                  className={
                    ability.source
                      ? 'chip inline-flex min-h-6 items-center justify-center border-info/50 bg-info/10 py-0.5 leading-none !text-info hover:!text-bone'
                      : KEYWORD_TAG_CLASS
                  }
                  note={ability.source ? `Added by ${ability.source}` : undefined}
                  highlightNote={false}
                />
              </span>
            ))}
          </div>
        </section>
      )
    }
    return (
      <section key={kind} data-onboarding={onboarding}>
        <SectionHeading title={title} count={found.length} />
        {cards}
      </section>
    )
  })
}

function UnitConfiguration({ sheet, rules, onboarding }: { sheet: Datasheet; rules: KeywordRule[]; onboarding?: OnboardingTarget }) {
  // Sources print a lone "None" when a unit has no wargear options.
  const wargearOptions = sheet.wargearOptions.filter((option) => option.trim().toLowerCase() !== 'none')
  if (!sheet.composition.length && !sheet.loadout && !wargearOptions.length && !sheet.costs.length) return null
  return (
    <section data-onboarding={onboarding}>
      <SectionHeading title="Unit configuration" />
      <div className="overflow-hidden border border-edge bg-panel">
        <div className="grid md:grid-cols-2 md:divide-x md:divide-edge">
          <div className="space-y-2 p-3">
            <h3 className="eyebrow">Composition</h3>
            {sheet.composition.map((line) => (
              <RuleText key={line} text={line} rules={rules} />
            ))}
            {sheet.baseSize ? <p className="text-sm whitespace-pre-line text-dim">Base size: {sheet.baseSize}</p> : null}
          </div>
          <div id="points" className="border-t border-edge p-3 md:border-t-0">
            <h3 className="eyebrow mb-2">Points</h3>
            <div className="divide-y divide-edge">
              {sheet.costs
                .toSorted((left, right) => Number(left.models) - Number(right.models))
                .map((cost) => (
                  <div key={JSON.stringify(cost)} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                    <span className="min-w-0">
                      {cost.models} {cost.models === '1' ? 'model' : 'models'}
                      {[cost.keyword, cost.faction, cost.detachment, cost.copies].filter(Boolean).length ? (
                        <span className="ml-1 text-xs text-dim">
                          · {[cost.keyword, cost.faction, cost.detachment, cost.copies].filter(Boolean).join(' · ')}
                        </span>
                      ) : null}
                    </span>
                    <span className="readout text-info">{cost.cost} pts</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
        {sheet.loadout ? (
          <div id="loadout" className="border-t border-edge p-3">
            <RuleText text={sheet.loadout} rules={rules} className="mt-0" />
          </div>
        ) : null}
        {wargearOptions.length ? (
          <div id="wargear" className="border-t border-edge p-3">
            <h3 className="eyebrow mb-2">Wargear options</h3>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-dim">
              {wargearOptions.map((option) => (
                <li key={option}>
                  <RuleText text={option} rules={rules} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  )
}

/** The newest points changes the data updates recorded to this datasheet, linking to the rest of its faction's. */
function PointsChanges({ faction, slug }: { faction: { slug: string; displayName: string }; slug: string }) {
  const { data: changes } = useQuery(referenceChangesQuery({ kind: 'datasheet', faction: faction.slug, slug }))
  const { date } = useDateFormatting()
  if (!changes?.length) return null
  return (
    <section id="points-changes">
      <SectionHeading title="Points changes" />
      <ul className="border border-edge bg-panel">
        {changes.map(({ recordedAt, change }) => (
          <li
            key={`${recordedAt}${JSON.stringify(change)}`}
            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-edge px-3 py-2 text-sm last:border-b-0"
          >
            <span className="readout text-dim">{date(recordedAt)}</span>
            <span className="readout text-xs text-bone">{changeDetail(change)}</span>
          </li>
        ))}
      </ul>
      <Link
        to="/data-updates/$catalogueId"
        params={{ catalogueId: faction.slug }}
        className="mt-2 inline-block text-sm text-info hover:text-bone"
      >
        All {faction.displayName} data updates
      </Link>
    </section>
  )
}

export function Relationships({
  sheet,
  abilityIds = noAnchorIds,
}: {
  sheet: Pick<Datasheet, 'attachments' | 'leaders' | 'supporters'>
  abilityIds?: readonly string[]
}) {
  const groups = attachmentGroups(sheet)
  if (!groups.length) return null
  return (
    <section id="relationships">
      <ReferenceAnchors prefix="ability" ids={abilityIds} />
      <SectionHeading title="Attachments" />
      <div className="grid gap-2 md:grid-cols-2">
        {groups.map(({ title, relationships }) => (
          <div key={title} className="border border-edge bg-panel p-3">
            <h3 className="eyebrow mb-2">{title}</h3>
            <div className="flex flex-wrap gap-1">
              {relationships.map(({ name, route }) =>
                route ? (
                  <FactionReferenceLink
                    key={name}
                    to="/factions/$catalogueId/datasheets/$entryId"
                    params={{ catalogueId: route.catalogueId, entryId: route.slug }}
                    className={KEYWORD_TAG_CLASS}
                  >
                    {name}
                  </FactionReferenceLink>
                ) : (
                  <span key={name} className={KEYWORD_TAG_CLASS}>
                    {name}
                  </span>
                ),
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

type DisplayProfile = StructuredDatasheetProfile

function UnitCharacteristics({
  profile,
  onboarding,
  anchorIds = noAnchorIds,
}: {
  profile: DisplayProfile
  onboarding?: OnboardingTarget
  anchorIds?: readonly string[]
}) {
  const invulnerable = profile.values.find((value) => datasheetCharacteristicKindOf(value) === 'invulnerable-save')?.value
  const values = profile.values.filter((value) => !['invulnerable-save', 'base-size'].includes(datasheetCharacteristicKindOf(value)))
  return (
    <section id={`profile-${profile.id}`} data-onboarding={onboarding}>
      <ReferenceAnchors prefix="profile" ids={anchorIds.filter((id) => id !== profile.id)} />
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {values.map((value) => (
          <div key={value.name} className="border border-edge bg-panel px-3 py-2 text-center">
            <p className="eyebrow">{value.name}</p>
            <p className="readout mt-1 text-lg">{value.value}</p>
          </div>
        ))}
      </div>
      {invulnerable ? (
        <div className="mt-2 flex items-center justify-between border border-edge bg-panel px-3 py-2">
          <span className="font-bold uppercase">Invulnerable save</span>
          <span className="readout text-lg">{invulnerable}</span>
        </div>
      ) : null}
    </section>
  )
}

function characteristicProfileGroups(profiles: DisplayProfile[]) {
  return [
    ...groupBy(profiles, (profile) =>
      JSON.stringify(
        profile.values.filter((value) => datasheetCharacteristicKindOf(value) !== 'base-size').map(({ name, value }) => ({ name, value })),
      ),
    ).values(),
  ]
}

const noColumns: DatasheetCharacteristicKind[] = []
const noProfileAnchorIds: ReadonlyMap<string, readonly string[]> = new Map()

export function ProfileTable({
  title,
  profiles,
  omit = noColumns,
  keywordRules,
  onboarding,
  anchorIds = noProfileAnchorIds,
}: {
  title: string
  profiles: DisplayProfile[]
  omit?: DatasheetCharacteristicKind[]
  keywordRules: KeywordRule[]
  onboarding?: OnboardingTarget
  anchorIds?: ReadonlyMap<string, readonly string[]>
}) {
  const columns = profileTableColumns(profiles).filter(
    ({ characteristic }) => !omit.includes(datasheetCharacteristicKindOf(characteristic)),
  )
  const groups =
    profiles[0] && ['ranged-weapon', 'melee-weapon'].includes(datasheetProfileKindOf(profiles[0]))
      ? weaponProfileGroups(profiles)
      : profiles.map((profile) => [profile])
  return (
    <section data-onboarding={onboarding}>
      <SectionHeading title={title} count={groups.length} />
      <div className="overflow-x-auto border border-edge bg-panel">
        <table className="w-full min-w-max text-left text-sm">
          <thead className="eyebrow border-b border-edge bg-raised">
            <tr>
              <th className="px-3 py-2">Name</th>
              {columns.map(({ key, characteristic }) => (
                <th key={key} className="px-3 py-2 text-center">
                  {characteristic.name}
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody
              key={group[0]!.id}
              aria-label={group.length > 1 ? `${weaponProfileGroupName(group)} profiles` : undefined}
              className="divide-y divide-edge border-t border-edge"
            >
              {group.length > 1 ? (
                <tr>
                  <th colSpan={columns.length + 1} className="bg-raised/50 px-3 py-2">
                    <span className="font-semibold uppercase">{weaponProfileGroupName(group)}</span>
                    <span className="ml-3 text-xs font-normal text-faint">{group.length} profiles</span>
                  </th>
                </tr>
              ) : null}
              {group.map((profile) => (
                <tr id={`profile-${profile.id}`} key={profile.id}>
                  <th
                    className={
                      group.length > 1 ? 'border-l-2 border-edge-strong py-2 pr-3 pl-10 font-normal text-dim' : 'px-3 py-2 font-semibold'
                    }
                  >
                    <ReferenceAnchors prefix="profile" ids={(anchorIds.get(profile.id) ?? []).filter((id) => id !== profile.id)} />
                    {group.length > 1 ? weaponProfileMode(profile, group) : profile.name}
                  </th>
                  {columns.map((column) => {
                    const value = profileTableValue(profile, column)
                    return (
                      <td key={column.key} className="readout px-3 py-2 text-center text-dim">
                        {datasheetCharacteristicKindOf(column.characteristic) === 'keywords' && value?.value ? (
                          <KeywordList value={value.value} rules={keywordRules} className="text-bone" />
                        ) : (
                          (value?.value ?? '—')
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  )
}

export function TransportReference({
  transport,
  profiles,
  abilities,
  rules,
}: {
  transport: string | null
  profiles: readonly Pick<DisplayProfile, 'id'>[]
  abilities: readonly Pick<DisplayAbility, 'name'>[]
  rules: KeywordRule[]
}) {
  if (!transport) return null
  const anchors = <ReferenceAnchors prefix="profile" ids={profiles.map((profile) => profile.id)} />
  const shown = separateTransport({ transport, abilities })
  if (!shown) return anchors
  return (
    <section>
      {anchors}
      <SectionHeading title="Transport" />
      <div className="border border-edge bg-panel p-3">
        <RuleText text={shown} rules={rules} className="mt-0" />
      </div>
    </section>
  )
}

function ReferenceAnchors({ prefix, ids }: { prefix: 'ability' | 'profile'; ids: readonly string[] }) {
  return ids.map((id) => <span id={`${prefix}-${id}`} key={id} className="block scroll-mt-header" />)
}
