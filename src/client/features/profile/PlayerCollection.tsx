import { useQuery } from '@tanstack/react-query'
import { factionIndexQuery } from '../../queries'
import { Link } from '@tanstack/react-router'
import type { CollectionGroup } from '../../../contracts/collection'
import { FactionMark, factionColour } from '../../components/FactionMark'
import { FactionReferenceLink } from '../../components/FactionReferenceLink'
import { collectionPhotoPath } from '../../../contracts/collection'
import { countLabel } from '../../text'

export function PlayerCollection({
  groups,
  wishlist,
  published,
  yourself,
}: {
  groups: readonly CollectionGroup[]
  wishlist: readonly CollectionGroup[]
  published: boolean
  yourself: boolean
}) {
  const models = groups.reduce((total, group) => total + group.models, 0)
  const datasheets = groups.reduce((total, group) => total + group.entries.length, 0)
  return (
    <section data-player-collection className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-dim">
          <span className="figure text-xl text-bone">{models}</span> models · {countLabel(datasheets, 'datasheet')}
        </p>
        {yourself ? (
          <Link to="/collection" className="text-sm text-info hover:underline">
            Manage collection
          </Link>
        ) : null}
      </div>
      {yourself ? (
        <p className="text-sm text-dim">
          {published ? 'Anyone can see your collection here.' : 'Only you can see your collection here.'}{' '}
          <Link to="/profile" hash="collection-sharing" className="text-info underline">
            Privacy settings
          </Link>
        </p>
      ) : null}
      {!groups.length ? (
        <p className="text-sm text-dim">Your shelf is empty. Add the models you own to your collection.</p>
      ) : (
        <CollectionGroups groups={groups} unit="models" />
      )}
      {wishlist.length ? (
        <section aria-labelledby="player-wishlist-heading" className="space-y-3">
          <h2 id="player-wishlist-heading" className="rubric border-b border-edge pb-2">
            Wishlist
          </h2>
          <CollectionGroups groups={wishlist} unit="wanted" />
        </section>
      ) : null}
    </section>
  )
}

function CollectionGroups({ groups, unit }: { groups: readonly CollectionGroup[]; unit: 'models' | 'wanted' }) {
  const factions = useQuery(factionIndexQuery())
  return (
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
              {group.catalogueId ? <FactionMark id={group.catalogueId} name={group.name} icon={faction?.icon ?? null} size="md" /> : null}
              <h2 className="rubric min-w-0 flex-1 text-bone">{group.name}</h2>
              <span className="text-xs text-dim">
                <span className="figure mr-1 text-lg text-bone">{group.models}</span>{' '}
                {unit === 'wanted' ? 'wanted' : group.models === 1 ? 'model' : 'models'}
              </span>
            </header>
            <ul className="divide-y divide-edge">
              {group.entries.map((entry) => (
                <li key={entry.entryId} data-collection-unit={entry.name} className="flex min-h-12 items-center gap-3 px-3 py-2">
                  {entry.photoIds?.[0] ? (
                    <a href={collectionPhotoPath(entry.photoIds[0])} target="_blank" rel="noreferrer" className="shrink-0">
                      <img
                        src={collectionPhotoPath(entry.photoIds[0], 'thumbnail')}
                        alt={entry.name}
                        loading="lazy"
                        className="size-8 border border-edge bg-sunken object-cover"
                      />
                    </a>
                  ) : null}
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
                  {entry.built ? (
                    <span className="readout shrink-0 text-xs text-dim">
                      {entry.built} built · {entry.painted ?? 0} painted
                    </span>
                  ) : null}
                  <span className="readout shrink-0 text-sm text-bone" aria-label={`${entry.name}: ${entry.models} ${unit}`}>
                    {entry.models}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
