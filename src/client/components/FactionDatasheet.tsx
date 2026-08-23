import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { routeSlug } from '../../core/slug'
import type { Datasheet } from '../../server/catalogue'
import { compositionCount, displayAbilities } from '../datasheet'
import { factionFor } from '../factions'
import { datasheetSlugQuery, factionsQuery } from '../queries'
import { FactionMark, factionColour } from './FactionMark'
import { CollectionToggle } from './CollectionToggle'
import { Keyword, KEYWORD_TAG_CLASS, KeywordList, type KeywordRule } from './Keyword'
import { RuleText } from './RuleText'

export function FactionDatasheet() {
  const params = useParams({ strict: false })
  const { data } = useQuery(factionsQuery())
  const faction = factionFor(data, params.catalogueId ?? '')
  const { data: sheet } = useQuery(datasheetSlugQuery(faction?.id ?? '', params.entryId ?? ''))
  if (!sheet || !faction) return null
  const profiles = (type: string) => sheet.profiles.filter((profile) => profile.type === type)
  const unit = uniqueCharacteristicProfiles(profiles('Unit'))
  const invulnerable = unit.flatMap((profile) => {
    const value = profile.values.find((characteristic) => characteristic.name === 'InSv')?.value
    return value ? [{ name: profile.name, value }] : []
  })
  const ranged = profiles('Ranged Weapons')
  const melee = profiles('Melee Weapons')

  return (
    <main className="w-full">
      <header
        className="relative overflow-hidden border-t-[3px] border-b border-edge bg-panel"
        style={{ borderTopColor: factionColour(faction.slug) }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_35%,color-mix(in_srgb,var(--color-parchment)_8%,transparent),transparent_75%)]" />
        <div className="relative mx-auto flex max-w-5xl items-start gap-3 px-3 pt-[17px] pb-5 sm:px-4 sm:pt-[25px] sm:pb-7">
          <FactionMark id={faction.slug} icon={faction.icon} />
          <div className="min-w-0 flex-1">
            <p className="eyebrow text-parchment">{faction.displayName} · Datasheet</p>
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <h1 className="min-w-0 text-3xl break-words">{sheet.name}</h1>
              <div className="flex flex-wrap items-center gap-1 sm:shrink-0 sm:justify-end">
                {sheet.composition.length ? <span className="chip">{compositionCount(sheet.composition)}</span> : null}
                {sheet.points === null ? null : <span className="chip text-info">{sheet.points} pts</span>}
                <CollectionToggle entryId={sheet.id} name={sheet.name} />
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {sheet.keywords.map((keyword) => (
                <Keyword key={keyword} name={keyword} rules={sheet.keywordRules} className={KEYWORD_TAG_CLASS} />
              ))}
            </div>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-5xl space-y-6 px-3 py-4 sm:px-4">
        <Breadcrumb>
          <BreadcrumbList className="eyebrow gap-1 text-info">
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to="/factions" />}>Factions</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="text-dim" />
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to="/factions/$catalogueId" params={{ catalogueId: faction.slug }} />}>
                {faction.displayName}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="text-dim" />
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to="/factions/$catalogueId/datasheets" params={{ catalogueId: faction.slug }} />}>
                Datasheets
              </BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {unit.length === 1 && unit[0] ? <UnitCharacteristics profile={unit[0]} /> : null}
        {unit.length > 1 ? <ProfileTable title="Models" profiles={unit} omit={['InSv']} keywordRules={sheet.keywordRules} /> : null}
        {unit.length > 1 && invulnerable.length ? (
          <section>
            <h2 className="rubric">Invulnerable save</h2>
            <div className="mt-2 flex flex-wrap gap-2">
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
        <Abilities abilities={displayAbilities(sheet.abilities)} rules={sheet.keywordRules} />
        <UnitConfiguration sheet={sheet} rules={sheet.keywordRules} />
        {sheet.transport ? (
          <section>
            <h2 className="rubric">Transport</h2>
            <div className="mt-2 border border-edge bg-panel p-3">
              <RuleText text={sheet.transport} rules={sheet.keywordRules} className="mt-0" />
            </div>
          </section>
        ) : null}
        <Relationships sheet={sheet} factionSlug={faction.slug} />
        {sheet.attribution ? <p className="border-t border-edge pt-4 text-xs text-dim">{sheet.attribution}.</p> : null}
      </div>
    </main>
  )
}

type DisplayAbility = { id: string; name: string; description: string | null; kind: 'core' | 'faction' | 'datasheet' | 'rule' | 'wargear' }

const abilitySections: { kind: DisplayAbility['kind']; title: string }[] = [
  { kind: 'core', title: 'Core abilities' },
  { kind: 'faction', title: 'Faction abilities' },
  { kind: 'datasheet', title: 'Datasheet abilities' },
  { kind: 'rule', title: 'Rules' },
  { kind: 'wargear', title: 'Wargear abilities' },
]

function Abilities({ abilities, rules }: { abilities: DisplayAbility[]; rules: KeywordRule[] }) {
  return abilitySections.map(({ kind, title }) => {
    const found = abilities.filter((ability) => ability.kind === kind)
    if (!found.length) return null
    const cards = (
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        {found.map((ability) => (
          <article key={ability.id} className="border border-edge bg-panel p-3">
            <h3 className="text-sm">{ability.name}</h3>
            {ability.description ? <RuleText text={ability.description} rules={rules} /> : null}
          </article>
        ))}
      </div>
    )
    if (kind === 'core' || kind === 'faction') {
      return (
        <section key={kind}>
          <h2 className="rubric">
            {title} <span className="readout text-faint">{found.length}</span>
          </h2>
          <div className="mt-2 flex flex-wrap gap-1">
            {found.map((ability) => (
              <Keyword
                key={ability.id}
                name={ability.name}
                rules={ability.description ? [{ name: ability.name, description: ability.description }] : []}
                className={KEYWORD_TAG_CLASS}
              />
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
        {cards}
      </section>
    )
  })
}

type DatasheetDisplay = Datasheet & {
  detachments: {
    id: string
    name: string
    rules: { name: string; description: string }[]
    enhancements: { name: string; description: string | null }[]
  }[]
}

function UnitConfiguration({ sheet, rules }: { sheet: DatasheetDisplay; rules: KeywordRule[] }) {
  if (!sheet.composition.length && !sheet.loadout && !sheet.wargearOptions.length && !sheet.costs.length) return null
  return (
    <section>
      <h2 className="rubric">Unit configuration</h2>
      <div className="mt-2 overflow-hidden border border-edge bg-panel">
        <div className="grid md:grid-cols-2 md:divide-x md:divide-edge">
          <div className="space-y-2 p-3">
            <h3 className="eyebrow">Composition</h3>
            {sheet.composition.map((line) => (
              <RuleText key={line} text={line} rules={rules} />
            ))}
            {sheet.baseSize ? <p className="text-sm text-dim">Base size: {sheet.baseSize}</p> : null}
          </div>
          <div className="border-t border-edge p-3 md:border-t-0">
            <h3 className="eyebrow mb-2">Points</h3>
            <div className="divide-y divide-edge">
              {sheet.costs
                .toSorted((left, right) => Number(left.models) - Number(right.models))
                .map((cost) => (
                  <div key={JSON.stringify(cost)} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                    <span className="min-w-0">
                      {cost.models} {cost.models === '1' ? 'model' : 'models'}
                      {[cost.keyword, cost.faction, cost.detachment].filter(Boolean).length ? (
                        <span className="ml-1 text-xs text-dim">
                          · {[cost.keyword, cost.faction, cost.detachment].filter(Boolean).join(' · ')}
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
          <div className="border-t border-edge p-3">
            <RuleText text={sheet.loadout} rules={rules} className="mt-0" />
          </div>
        ) : null}
        {sheet.wargearOptions.length ? (
          <div className="border-t border-edge p-3">
            <h3 className="eyebrow mb-2">Wargear options</h3>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-dim">
              {sheet.wargearOptions.map((option) => (
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

function Relationships({ sheet, factionSlug }: { sheet: DatasheetDisplay; factionSlug: string }) {
  const groups = [
    { title: 'Can lead', names: sheet.attachments.filter((entry) => entry.kind === 'leader').map((entry) => entry.name) },
    { title: 'Can support', names: sheet.attachments.filter((entry) => entry.kind === 'support').map((entry) => entry.name) },
    { title: 'Can be led by', names: sheet.leaders },
    { title: 'Can be supported by', names: sheet.supporters },
  ].filter(({ names }) => names.length)
  if (!groups.length) return null
  return (
    <section>
      <h2 className="rubric">Attachments</h2>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        {groups.map(({ title, names }) => (
          <div key={title} className="border border-edge bg-panel p-3">
            <h3 className="eyebrow mb-2">{title}</h3>
            <div className="flex flex-wrap gap-1">
              {names.map((name) => (
                <Link
                  key={name}
                  to="/factions/$catalogueId/datasheets/$entryId"
                  params={{ catalogueId: factionSlug, entryId: routeSlug(name) }}
                  className={KEYWORD_TAG_CLASS}
                >
                  {name}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

type DisplayProfile = { id: string; name: string; values: { name: string; value: string }[] }

function UnitCharacteristics({ profile }: { profile: DisplayProfile }) {
  const invulnerable = profile.values.find((value) => value.name === 'InSv')?.value
  const values = profile.values.filter((value) => value.name !== 'InSv')
  return (
    <section>
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

function uniqueCharacteristicProfiles(profiles: DisplayProfile[]) {
  const seen = new Set<string>()
  return profiles.filter((profile) => {
    const signature = JSON.stringify(profile.values.map(({ name, value }) => ({ name, value })))
    if (seen.has(signature)) return false
    seen.add(signature)
    return true
  })
}

const noColumns: string[] = []

function ProfileTable({
  title,
  profiles,
  omit = noColumns,
  keywordRules,
}: {
  title: string
  profiles: DisplayProfile[]
  omit?: string[]
  keywordRules: KeywordRule[]
}) {
  const columns = [...new Set(profiles.flatMap((profile) => profile.values.map((value) => value.name)))].filter(
    (column) => !omit.includes(column),
  )
  return (
    <section>
      <h2 className="rubric">
        {title} <span className="readout text-faint">{profiles.length}</span>
      </h2>
      <div className="mt-2 overflow-x-auto border border-edge bg-panel">
        <table className="w-full min-w-max text-left text-sm">
          <thead className="eyebrow border-b border-edge bg-raised">
            <tr>
              <th className="px-3 py-2">Name</th>
              {columns.map((column) => (
                <th key={column} className="px-3 py-2 text-center">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-edge">
            {profiles.map((profile) => (
              <tr key={profile.id}>
                <th className="px-3 py-2 font-semibold">{profile.name}</th>
                {columns.map((column) => (
                  <td key={column} className="readout px-3 py-2 text-center text-dim">
                    {column === 'Keywords' && profile.values.find((value) => value.name === column)?.value ? (
                      <KeywordList
                        value={profile.values.find((value) => value.name === column)!.value}
                        rules={keywordRules}
                        className="text-bone"
                      />
                    ) : (
                      (profile.values.find((value) => value.name === column)?.value ?? '—')
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
