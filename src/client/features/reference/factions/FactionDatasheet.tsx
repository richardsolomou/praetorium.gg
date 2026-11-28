import { useReferenceFaction } from './useReferenceFaction'
import { FactionReferenceLink } from '../../../components/FactionReferenceLink'
import { useQuery } from '@tanstack/react-query'
import { MessageSquareWarning } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Link, useParams } from '@tanstack/react-router'
import { FactionBreadcrumb } from './FactionBreadcrumb'
import {
  datasheetCharacteristicKindOf,
  datasheetProfileKindOf,
  datasheetProfilesByKind,
  isWrittenInvulnerableSave,
  NON_STATLINE_KINDS,
  statlineValues,
} from '../../../../core/datasheetStructure'
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
import { datasheetSlugQuery, referenceChangesQuery, topFourUnitListsQuery } from '../../../queries'
import { baseFootprints } from './hobbyKitBases'
import { HobbyKitCard } from '../../../components/HobbyKitCard'
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
import { useRuleSummary } from '../../../ruleSummaries'
import { Blocks, blocksText, RuleSummarySkeleton, RuleSummaryText, Runs, textOf } from '../../../components/RuleSummaryText'
import {
  DatasheetUnit,
  datasheetUnit,
  unitLoadout,
  unitOptions,
  unitTransport,
  useUnitAbilitySummary,
  useVsDataUnit,
} from '../../../components/UnitFromVsData'
import { unitComposition } from '../../../../shared/vsDataUnitLines'
import { InvulnerableSaves, shownSaves } from '../../../components/InvulnerableSaves'
import { PageContent, PageHeader } from '../../../components/Page'
import { groupBy } from '../../../../core/collections'
import { rulesVersionLabel } from '../../../../core/catalogueEdition'
import { reportDataProblem } from '../../feedback/support'
import { SectionHeading } from '../../../components/SectionHeading'
import { countLabel, placingLabel } from '../../../text'
import { TopFourSources } from '../../rosters/TopFourSources'
import { FactionGames } from './FactionGames'
import { NextStep } from '../NextStep'
import { ContinueGuestDraft } from '../../rosters/ContinueGuestDraft'
import { datasheetMatchup } from '../../../../contracts/simulatorState'

export function FactionDatasheet() {
  const params = useParams({ strict: false })
  const faction = useReferenceFaction()
  const { data: sheet } = useQuery(datasheetSlugQuery(faction?.id ?? '', params.entryId ?? ''))
  const vsDataSaves = useVsDataUnit(faction?.id ?? '', sheet?.id ?? '', Boolean(faction && sheet))?.invulnerableSaves
  if (!sheet || !faction) return null
  const structured = datasheetProfilesByKind(sheet)
  const unitGroups = characteristicProfileGroups(structured.unit)
  const unit = unitGroups.map((group) => group[0]!)
  const unitAnchorIds = new Map(unitGroups.map((group) => [group[0]!.id, group.map((profile) => profile.id)]))
  // VS Data's saves replace the catalogue's figure, which shows while they load in the same place, so nothing moves.
  const saves = shownSaves({ profiles: unit }, vsDataSaves)
  const ranged = structured.ranged
  const melee = structured.melee
  // The save shown above stands for the catalogue's ability writing it out.
  const abilities = referenceAbilities(sheet.abilities, sheet.attachments).filter(
    (ability) => !saves.length || !isWrittenInvulnerableSave(ability.name),
  )
  const visibleAbilityIds = new Set(abilities.map((ability) => ability.id))
  const relationshipAbilityIds = sheet.abilities.filter((ability) => !visibleAbilityIds.has(ability.id)).map((ability) => ability.id)

  const unitKey = datasheetUnit(faction.id, sheet.id)
  return (
    <DatasheetUnit.Provider value={unitKey}>
      <main id="summary" className="w-full">
        <PageHeader
          tint={factionColour(faction.slug, faction.displayName)}
          title={sheet.name}
          media={<FactionMark faction={faction} />}
          actions={
            <div className="flex flex-wrap items-center gap-1">
              <AddToRoster faction={faction} entryId={sheet.id} name={sheet.name} />
              <DatasheetAddMenu entryId={sheet.id} name={sheet.name} />
              <SimulateDatasheet catalogueId={faction.id} entryId={sheet.id} />
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  reportDataProblem({
                    from: 'datasheet',
                    name: sheet.name,
                    faction: faction.displayName,
                    rulesVersion: rulesVersionLabel(faction),
                    catalogueId: faction.id,
                    entryId: sheet.id,
                  })
                }
              >
                <MessageSquareWarning /> Something wrong?
              </Button>
            </div>
          }
        >
          {sheet.modelCount || sheet.points !== null ? (
            <div className="flex flex-wrap gap-1">
              {sheet.modelCount ? <span className="chip">{sheet.modelCount}</span> : null}
              {sheet.points === null ? null : <span className="chip text-bone">{sheet.points} pts</span>}
            </div>
          ) : null}
          <UnitKeywords id="keyword-rules" className="mt-2" sheet={sheet} />
        </PageHeader>
        <PageContent className="space-y-6">
          <FactionBreadcrumb faction={faction} datasheets />
          <ContinueGuestDraft surface="datasheet" />

          {unit.length === 1 && unit[0] ? <UnitCharacteristics profile={unit[0]} anchorIds={unitAnchorIds.get(unit[0].id)} /> : null}
          {unit.length > 1 ? (
            <ProfileTable
              title="Models"
              profiles={unit}
              omit={NON_STATLINE_KINDS}
              keywordRules={sheet.keywordRules}
              anchorIds={unitAnchorIds}
            />
          ) : null}
          {saves.length ? <InvulnerableSaves saves={saves} /> : null}
          {ranged.length ? <ProfileTable title="Ranged weapons" profiles={ranged} keywordRules={sheet.keywordRules} /> : null}
          {melee.length ? <ProfileTable title="Melee weapons" profiles={melee} keywordRules={sheet.keywordRules} /> : null}
          <Abilities abilities={abilities} rules={sheet.keywordRules} />
          <ProfileRules profiles={sheet.profiles} rules={sheet.keywordRules} />
          <UnitConfiguration sheet={sheet} catalogueId={faction.id} />
          <TransportReference
            transport={sheet.transport}
            profiles={structured.transport}
            abilities={abilities}
            rules={sheet.keywordRules}
            catalogueId={faction.id}
            entryId={sheet.id}
          />
          <Relationships sheet={sheet} abilityIds={relationshipAbilityIds} />
          <TopFourLists faction={faction} entryId={sheet.id} name={sheet.name} />
          <PointsChanges faction={faction} slug={sheet.slug} />
          <DatasheetPhotos entryId={sheet.id} name={sheet.name} />
          <FactionGames faction={faction} />
          <DatasheetNextStep faction={faction} sheet={sheet} />
        </PageContent>
      </main>
    </DatasheetUnit.Provider>
  )
}

type DisplayAbility = Datasheet['abilities'][number]
const noAnchorIds: readonly string[] = []

export function Abilities({ abilities, rules }: { abilities: DisplayAbility[]; rules: KeywordRule[] }) {
  return Object.entries(abilitySections).map(([kind, title]) => {
    const found = abilities.filter((ability) => ability.kind === kind)
    if (!found.length) return null
    const cards = (
      <div className="grid border-t border-edge md:grid-cols-2 md:gap-x-6">
        {found.map((ability) => (
          <article id={`ability-${ability.id}`} key={ability.id} className="border-b border-edge py-3">
            <h3 className="text-sm">{ability.source ?? ability.name}</h3>
            {ability.source ? <p className="eyebrow mt-1">{ability.name}</p> : null}
            {ability.description ? <RuleText text={ability.description} rules={rules} name={ability.name} abilityId={ability.id} /> : null}
          </article>
        ))}
      </div>
    )
    if (kind === 'core' || kind === 'faction') {
      return (
        <section key={kind}>
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
                  condition={ability.condition}
                  highlightNote={false}
                />
              </span>
            ))}
          </div>
        </section>
      )
    }
    return (
      <section key={kind}>
        <SectionHeading title={title} count={found.length} />
        {cards}
      </section>
    )
  })
}

/** The end of a datasheet: this unit in a new or existing list, or the simulator and the tournament lists that take it. */
function DatasheetNextStep({ faction, sheet }: { faction: NonNullable<ReturnType<typeof useReferenceFaction>>; sheet: Datasheet }) {
  const { data: winning } = useQuery(topFourUnitListsQuery(faction.id, sheet.id))
  if (!faction.detachments.length && !faction.withoutDetachments) return null
  const linkClass = 'text-sm text-dim underline decoration-runner-hi underline-offset-4 hover:text-bone'
  return (
    <NextStep
      title={`Build a list with ${sheet.name}`}
      description={`Your faction is already filled in, with ${sheet.name} added.`}
      action={<AddToRoster faction={faction} entryId={sheet.id} name={sheet.name} closing />}
      links={
        <>
          <Link to="/simulator" search={{ s: datasheetMatchup(faction.id, sheet.id, 'attacker'), from: 'datasheet' }} className={linkClass}>
            Simulate {sheet.name}
          </Link>
          {winning?.of ? (
            <Link
              to="/rosters"
              search={{ view: 'tournament-lists', faction: faction.slug, ...(winning.lists.length ? { unit: sheet.id } : {}) }}
              className={linkClass}
            >
              {winning.lists.length
                ? `${countLabel(winning.lists.length, 'winning list')} ${winning.lists.length === 1 ? 'takes' : 'take'} it`
                : `${countLabel(winning.of, 'winning list')} for ${faction.displayName}`}
            </Link>
          ) : null}
        </>
      }
    />
  )
}

const SHOWN_LISTS = 5

/** The faction's top-four tournament lists that field this datasheet: how many, how they take it, and the newest few. */
function TopFourLists({
  faction,
  entryId,
  name,
}: {
  faction: { id: string; slug: string; displayName: string }
  entryId: string
  name: string
}) {
  const { data } = useQuery(topFourUnitListsQuery(faction.id, entryId))
  const { date } = useDateFormatting()
  if (!data?.lists.length) return null
  const { lists, of } = data
  const tallied = (values: readonly number[]) =>
    [...groupBy(values, (value) => value)].toSorted(([left], [right]) => left - right).map(([value, all]) => [value, all.length] as const)
  const copies = tallied(lists.map((list) => list.models.length))
  const sizes = tallied(lists.flatMap((list) => list.models))
  return (
    <section id="top-four-lists">
      <SectionHeading title="Top-four tournament lists" count={lists.length} />
      <p className="text-sm text-dim">
        {lists.length} of the {of} {faction.displayName} lists that finished top four at tournaments outside Praetorium take {name}. The
        lists come from <TopFourSources />.
      </p>
      <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="eyebrow self-center">Copies</dt>
        <dd className="readout text-bone">{copies.map(([count, taking]) => `${count}× in ${countLabel(taking, 'list')}`).join(' · ')}</dd>
        {sizes.length > 1 ? (
          <>
            <dt className="eyebrow self-center">Unit size</dt>
            <dd className="readout text-bone">
              {sizes.map(([models, units]) => `${countLabel(models, 'model')} in ${countLabel(units, 'unit')}`).join(' · ')}
            </dd>
          </>
        ) : null}
      </dl>
      <ul className="mt-3 border-t border-edge">
        {lists.slice(0, SHOWN_LISTS).map((list) => (
          <li key={list.id}>
            {/* Opening a list imports it on the server, so passing a pointer or a finger over links must not ask for each. */}
            <Link
              to="/rosters/winning/$listId"
              params={{ listId: list.id }}
              preload={false}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-edge px-2 py-2.5 text-sm transition-colors hover:bg-raised"
            >
              <span className="chip shrink-0">{placingLabel(list.placing)}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">{list.event.name}</span>
              {list.models.length > 1 ? <span className="readout text-xs text-dim">{list.models.length}×</span> : null}
              <span className="readout text-xs text-dim">{date(Date.parse(list.event.date))}</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link
        to="/rosters"
        search={{ view: 'tournament-lists', faction: faction.slug, unit: entryId }}
        className="mt-2 inline-block text-sm text-dim underline decoration-runner-hi underline-offset-4 hover:text-bone"
      >
        {lists.length > SHOWN_LISTS ? `All ${countLabel(lists.length, 'list')}` : 'Open in Tournament lists'}
      </Link>
    </section>
  )
}

/** A unit's composition, loadout, options, base size and prices; all but the prices and base size come from VS Data. */
function UnitConfiguration({ sheet, catalogueId }: { sheet: Datasheet; catalogueId: string }) {
  const unit = useVsDataUnit(catalogueId, sheet.id)
  const composition = unit ? unitComposition(unit) : []
  const loadout = unit ? unitLoadout(unit) : []
  const options = unit ? unitOptions(unit) : []
  if (!sheet.baseSize && !sheet.costs.length && !composition.length) return null
  return (
    <section>
      <SectionHeading title="Unit configuration" />
      <div className="overflow-hidden border-y border-edge">
        <div className="grid md:grid-cols-2 md:divide-x md:divide-edge">
          <div className="space-y-2 p-3">
            <h3 className="eyebrow">Composition</h3>
            {unit === undefined ? <RuleSummarySkeleton className="mt-0" /> : null}
            {composition.map((line) => (
              <p key={textOf(line)} className="text-sm text-dim">
                <Runs runs={line} />
              </p>
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
                    <span className="readout font-semibold">{cost.cost} pts</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
        {loadout.length ? (
          <div id="loadout" className="border-t border-edge p-3">
            <h3 className="eyebrow mb-2">Loadout</h3>
            {loadout.map((line) => (
              <p key={textOf(line)} className="text-sm text-dim">
                <Runs runs={line} />
              </p>
            ))}
          </div>
        ) : null}
        {options.length ? (
          <div id="wargear" className="border-t border-edge p-3">
            <h3 className="eyebrow mb-2">Wargear options</h3>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-dim">
              {options.map((option) => (
                <li key={blocksText(option)} className="space-y-0.5">
                  <Blocks blocks={option} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <PrintTheBases sheet={sheet} />
    </section>
  )
}

function PrintTheBases({ sheet }: { sheet: Datasheet }) {
  const footprints = baseFootprints(sheet.baseSize)
  const [first] = footprints
  if (!first) return null
  const size = (footprint: string) => `${footprint.replace('x', '×')}mm`
  const several = footprints.length > 1
  return (
    <HobbyKitCard
      className="mt-3"
      title={several ? 'Need bases for this unit?' : `Need a ${size(first)} base?`}
      description="A free, open-source companion to Praetorium for your 3D printer."
      links={footprints.map((footprint) => ({ label: several ? size(footprint) : 'Open in HobbyKit', to: `/#base=${footprint}` }))}
    />
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
      <ul className="border-t border-edge">
        {changes.map(({ recordedAt, change }) => (
          <li
            key={`${recordedAt}${JSON.stringify(change)}`}
            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-edge px-2 py-2.5 text-sm"
          >
            <span className="readout font-semibold">{date(recordedAt)}</span>
            <span className="readout text-xs text-bone">{changeDetail(change)}</span>
          </li>
        ))}
      </ul>
      <Link
        to="/data-updates/$catalogueId"
        params={{ catalogueId: faction.slug }}
        className="mt-2 inline-block text-sm text-dim underline decoration-runner-hi underline-offset-4 hover:text-bone"
      >
        All {faction.displayName} data updates
      </Link>
    </section>
  )
}

/** Another datasheet, not this unit's keyword, so it stays neutral beside the green keywords. */
const RELATIONSHIP_TAG = 'chip inline-flex min-h-6 items-center border-edge py-0.5 leading-none text-dim hover:text-bone'

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
      <div className="grid gap-y-4 md:grid-cols-2 md:gap-x-6">
        {groups.map(({ title, relationships }) => (
          <div key={title}>
            <h3 className="eyebrow mb-2">{title}</h3>
            <div className="flex flex-wrap gap-1">
              {relationships.map(({ name, route }) =>
                route ? (
                  <FactionReferenceLink
                    key={name}
                    to="/factions/$catalogueId/datasheets/$entryId"
                    params={{ catalogueId: route.catalogueId, entryId: route.slug }}
                    className={RELATIONSHIP_TAG}
                  >
                    {name}
                  </FactionReferenceLink>
                ) : (
                  <span key={name} className={RELATIONSHIP_TAG}>
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

function UnitCharacteristics({ profile, anchorIds = noAnchorIds }: { profile: DisplayProfile; anchorIds?: readonly string[] }) {
  const values = statlineValues(profile.values)
  return (
    <section id={`profile-${profile.id}`}>
      <ReferenceAnchors prefix="profile" ids={anchorIds.filter((id) => id !== profile.id)} />
      <div className="grid grid-cols-6 divide-x divide-edge border-y border-edge">
        {values.map((value) => (
          <div key={value.name} className="min-w-0 px-1 pt-2.5 pb-3 text-center">
            <p className="eyebrow">{value.name}</p>
            <p className="figure mt-1 text-2xl leading-none font-semibold sm:text-3xl">{value.value}</p>
          </div>
        ))}
      </div>
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

const noColumns: readonly DatasheetCharacteristicKind[] = []
const noProfileAnchorIds: ReadonlyMap<string, readonly string[]> = new Map()

export function ProfileTable({
  title,
  profiles,
  omit = noColumns,
  keywordRules,
  anchorIds = noProfileAnchorIds,
}: {
  title: string
  profiles: DisplayProfile[]
  omit?: readonly DatasheetCharacteristicKind[]
  keywordRules: KeywordRule[]
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
    <section>
      <SectionHeading title={title} count={groups.length} />
      <div className="overflow-x-auto border-y border-edge">
        <table className="w-full min-w-max text-left text-sm">
          <thead className="eyebrow border-b border-edge">
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
                  <th colSpan={columns.length + 1} className="px-3 py-2">
                    <span className="font-semibold">{weaponProfileGroupName(group)}</span>
                    <span className="ml-3 text-xs font-normal text-faint">{group.length} profiles</span>
                  </th>
                </tr>
              ) : null}
              {group.map((profile) => (
                <tr id={`profile-${profile.id}`} key={profile.id}>
                  <th
                    className={group.length > 1 ? 'border-l border-runner py-2 pr-3 pl-10 font-normal text-dim' : 'px-3 py-2 font-semibold'}
                  >
                    <ReferenceAnchors prefix="profile" ids={(anchorIds.get(profile.id) ?? []).filter((id) => id !== profile.id)} />
                    {group.length > 1 ? weaponProfileMode(profile, group) : profile.name}
                  </th>
                  {columns.map((column) => {
                    const value = profileTableValue(profile, column)
                    return (
                      <td key={column.key} className="readout px-3 py-2 text-center text-bone">
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
  catalogueId = '',
  entryId = '',
}: {
  transport: string | null
  profiles: readonly Pick<DisplayProfile, 'id'>[]
  abilities: readonly Pick<DisplayAbility, 'name'>[]
  rules: KeywordRule[]
  catalogueId?: string
  entryId?: string
}) {
  const shown = transport && separateTransport({ transport, abilities })
  const { summary } = useRuleSummary(shown ?? '')
  const unit = useVsDataUnit(catalogueId, entryId)
  const facts = unit ? unitTransport(unit) : []
  // A capacity VS Data cannot type, as the Manta's, shows as its summary of the unit's Transport ability instead.
  const ofUnit = useUnitAbilitySummary('Transport', Boolean(shown) && !summary && !facts.length)
  if (!transport && !facts.length) return null
  const anchors = <ReferenceAnchors prefix="profile" ids={profiles.map((profile) => profile.id)} />
  // Only a summary of the rule and VS Data's transport facts are ever shown, so a rule with neither leaves no section.
  if (!(shown && summary) && !ofUnit && !facts.length) return anchors
  return (
    <section>
      {anchors}
      <SectionHeading title="Transport" />
      <div className="space-y-1 border-y border-edge py-3">
        {facts.map((line) => (
          <p key={textOf(line)} className="text-sm text-dim">
            <Runs runs={line} />
          </p>
        ))}
        {shown && summary ? <RuleText text={shown} rules={rules} className={facts.length ? 'mt-2' : 'mt-0'} /> : null}
        {ofUnit && !summary ? <RuleSummaryText summary={ofUnit} className="mt-0" /> : null}
      </div>
    </section>
  )
}

function ReferenceAnchors({ prefix, ids }: { prefix: 'ability' | 'profile'; ids: readonly string[] }) {
  return ids.map((id) => <span id={`${prefix}-${id}`} key={id} className="block scroll-mt-header" />)
}
