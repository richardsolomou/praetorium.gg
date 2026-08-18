import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound, redirect, useParams } from '@tanstack/react-router'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Keyword, KEYWORD_TAG_CLASS, KeywordList, type KeywordRule } from '../client/components/Keyword'
import { RuleText } from '../client/components/RuleText'
import { factionFor } from '../client/factions'
import { datasheetSlugQuery, factionsQuery } from '../client/queries'
import { FactionMark, factionColour } from '../client/components/FactionMark'

export const Route = createFileRoute('/factions/$catalogueId/$entryId')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/factions/$catalogueId/datasheets/$entryId', params, replace: true })
  },
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(factionsQuery())
    const faction = factionFor(data, params.catalogueId)
    if (!faction || !(await context.queryClient.ensureQueryData(datasheetSlugQuery(faction.id, params.entryId)))) throw notFound()
  },
  component: DatasheetPage,
})

export function DatasheetPage() {
  const params = useParams({ strict: false })
  const { data } = useQuery(factionsQuery())
  const faction = factionFor(data, params.catalogueId ?? '')
  const { data: sheet } = useQuery(datasheetSlugQuery(faction?.id ?? '', params.entryId ?? ''))
  if (!sheet || !faction) return null
  const profiles = (type: string) => sheet.profiles.filter((profile) => profile.type === type)
  const unit = profiles('Unit')
  const invulnerable = unit.flatMap((profile) => {
    const value = profile.values.find((characteristic) => characteristic.name === 'InSv')?.value
    return value ? [{ name: profile.name, value }] : []
  })
  const ranged = profiles('Ranged Weapons')
  const melee = profiles('Melee Weapons')

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <Breadcrumb>
        <BreadcrumbList className="eyebrow gap-1 text-azure">
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
      <header className="flex items-start gap-3 border-b pb-4" style={{ borderBottomColor: factionColour(faction.slug) }}>
        <FactionMark id={faction.slug} icon={faction.icon} />
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{faction.displayName} · Datasheet</p>
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-3xl">{sheet.name}</h1>
            {sheet.points === null ? null : <span className="chip shrink-0">{sheet.points} pts</span>}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {sheet.keywords.map((keyword) => (
              <Keyword key={keyword} name={keyword} rules={sheet.keywordRules} className={KEYWORD_TAG_CLASS} />
            ))}
          </div>
        </div>
      </header>

      {unit.length ? <ProfileTable title="Models" profiles={unit} omit={['InSv']} keywordRules={sheet.keywordRules} /> : null}
      {invulnerable.length ? (
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
      <Abilities abilities={sheet.abilities} rules={sheet.keywordRules} />
      {sheet.attribution ? <p className="border-t border-edge pt-4 text-xs text-dim">{sheet.attribution}.</p> : null}
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
    return (
      <section key={kind}>
        <h2 className="rubric">
          {title} <span className="readout text-faint">{found.length}</span>
        </h2>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {found.map((ability) => (
            <article key={ability.id} className="border border-edge bg-panel p-3">
              <h3 className="text-sm">{ability.name}</h3>
              {ability.description ? <RuleText text={ability.description} rules={rules} /> : null}
            </article>
          ))}
        </div>
      </section>
    )
  })
}

type DisplayProfile = { id: string; name: string; values: { name: string; value: string }[] }

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
