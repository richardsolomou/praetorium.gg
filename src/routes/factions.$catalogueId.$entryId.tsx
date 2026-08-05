import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { factionFor } from '../client/factions'
import { datasheetSlugQuery, factionsQuery } from '../client/queries'

export const Route = createFileRoute('/factions/$catalogueId/$entryId')({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(factionsQuery())
    const faction = factionFor(data, params.catalogueId)
    if (!faction || !(await context.queryClient.ensureQueryData(datasheetSlugQuery(faction.id, params.entryId)))) throw notFound()
  },
  component: DatasheetPage,
})

function DatasheetPage() {
  const params = Route.useParams()
  const { data } = useQuery(factionsQuery())
  const faction = factionFor(data, params.catalogueId)
  const { data: sheet } = useQuery(datasheetSlugQuery(faction?.id ?? '', params.entryId))
  if (!sheet || !faction) return null
  const profiles = (type: string) => sheet.profiles.filter((profile) => profile.type === type)
  const unit = profiles('Unit')
  const ranged = profiles('Ranged Weapons')
  const melee = profiles('Melee Weapons')
  const abilities = profiles('Abilities')

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <nav aria-label="Breadcrumb" className="eyebrow flex flex-wrap items-center gap-1 text-azure">
        <Link to="/factions">Factions</Link>
        <ChevronRight className="size-3 text-dim" aria-hidden />
        <Link to="/factions/$catalogueId" params={{ catalogueId: faction.slug }}>
          {faction?.displayName ?? 'Faction'}
        </Link>
        <ChevronRight className="size-3 text-dim" aria-hidden />
        <Link to="/factions/$catalogueId/reference" params={{ catalogueId: faction.slug }}>
          {faction?.references[0]?.name ?? 'Reference'}
        </Link>
        <ChevronRight className="size-3 text-dim" aria-hidden />
        <Link to="/factions/$catalogueId/reference/datasheets" params={{ catalogueId: faction.slug }}>
          Datasheets
        </Link>
      </nav>
      <header className="border-b border-edge pb-4">
        <p className="eyebrow">Datasheet</p>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-3xl">{sheet.name}</h1>
          {sheet.points === null ? null : <span className="chip shrink-0">{sheet.points} pts</span>}
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {sheet.keywords.map((keyword) => (
            <span key={keyword} className="chip">
              {keyword}
            </span>
          ))}
        </div>
      </header>

      {unit.length ? <ProfileTable title="Models" profiles={unit} /> : null}
      {ranged.length ? <ProfileTable title="Ranged weapons" profiles={ranged} /> : null}
      {melee.length ? <ProfileTable title="Melee weapons" profiles={melee} /> : null}
      {abilities.length ? (
        <section>
          <h2 className="rubric">
            Abilities <span className="readout text-faint">{abilities.length}</span>
          </h2>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {abilities.map((ability) => (
              <article key={ability.id} className="border border-edge bg-panel p-3">
                <h3 className="text-sm">{ability.name}</h3>
                <p className="mt-1 text-sm whitespace-pre-line text-dim">
                  {ability.values.find((value) => value.name === 'Description')?.value}
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  )
}

type DisplayProfile = { id: string; name: string; values: { name: string; value: string }[] }

function ProfileTable({ title, profiles }: { title: string; profiles: DisplayProfile[] }) {
  const columns = [...new Set(profiles.flatMap((profile) => profile.values.map((value) => value.name)))]
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
                    {profile.values.find((value) => value.name === column)?.value ?? '—'}
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
