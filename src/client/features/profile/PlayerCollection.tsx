import { useQuery } from '@tanstack/react-query'
import { factionIndexQuery } from '../../queries'
import { Link } from '@tanstack/react-router'
import type { CollectionGroup } from '../../../contracts/collection'
import { FactionMark, factionColour } from '../../components/FactionMark'
import { FactionReferenceLink } from '../../components/FactionReferenceLink'
import { CollectionSharing } from '../collection/CollectionSharing'

export function PlayerCollection({
  userId,
  groups,
  published,
  yourself,
}: {
  userId: string
  groups: readonly CollectionGroup[]
  published: boolean
  yourself: boolean
}) {
  const factions = useQuery({ ...factionIndexQuery(), enabled: groups.length > 0 })
  const models = groups.reduce((total, group) => total + group.models, 0)
  const datasheets = groups.reduce((total, group) => total + group.entries.length, 0)
  return (
    <section data-player-collection className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-dim">
          <span className="figure text-xl text-bone">{models}</span> models · {datasheets} {datasheets === 1 ? 'datasheet' : 'datasheets'}
        </p>
        {yourself ? (
          <Link to="/collection" className="text-sm text-info hover:underline">
            Manage collection
          </Link>
        ) : null}
      </div>
      {yourself ? <CollectionSharing userId={userId} published={published} /> : null}
      {!groups.length ? (
        <p className="border border-edge bg-panel p-5 text-sm text-dim">Your shelf is empty. Add the models you own to your collection.</p>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {groups.map((group) => {
            const faction = factions.data?.factions.find((entry) => entry.id === group.catalogueId)
            return (
              <section
                key={group.catalogueId ?? 'retired'}
                aria-label={group.name}
                className="border border-t-[3px] border-edge bg-panel"
                style={{ borderTopColor: factionColour(group.catalogueId ?? '', group.name) }}
              >
                <header className="flex items-center gap-3 border-b border-edge px-3 py-2.5">
                  {group.catalogueId ? (
                    <FactionMark id={group.catalogueId} name={group.name} icon={faction?.icon ?? null} size="md" />
                  ) : null}
                  <h2 className="rubric min-w-0 flex-1 text-bone">{group.name}</h2>
                  <span className="text-xs text-dim">
                    <span className="figure mr-1 text-lg text-bone">{group.models}</span> {group.models === 1 ? 'model' : 'models'}
                  </span>
                </header>
                <ul className="divide-y divide-edge">
                  {group.entries.map((entry) => (
                    <li key={entry.entryId} data-collection-unit={entry.name} className="flex min-h-12 items-center gap-3 px-3 py-2">
                      {group.catalogueId && entry.slug ? (
                        <FactionReferenceLink
                          to="/factions/$catalogueId/datasheets/$entryId"
                          params={{ catalogueId: group.catalogueId, entryId: entry.slug }}
                          className="min-w-0 flex-1 text-sm font-semibold text-bone uppercase hover:text-info hover:underline"
                        >
                          {entry.name}
                        </FactionReferenceLink>
                      ) : (
                        <span className="min-w-0 flex-1 text-sm text-dim">{entry.name}</span>
                      )}
                      <span className="readout shrink-0 text-sm text-bone" aria-label={`${entry.name}: ${entry.models} models`}>
                        {entry.models}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </section>
  )
}
