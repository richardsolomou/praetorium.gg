import { useQuery } from '@tanstack/react-query'
import { factionIndexQuery } from '../../queries'
import { Link } from '@tanstack/react-router'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CollectionGroup } from '../../../contracts/collection'
import { FactionMark } from '../../components/FactionMark'
import { collectionPhotoPath } from '../../../contracts/collection'
import { countLabel } from '../../text'
import { CollectionCard, CollectionCardGrid } from '../collection/CollectionCard'
import { usePhotoSteps } from '../collection/PhotoLightbox'
import { PhotoViewer, type SharedPhoto } from '../collection/PhotoViewer'

export function PlayerCollection({
  owner,
  groups,
  wishlist,
  yourself,
}: {
  owner: SharedPhoto['owner']
  groups: readonly CollectionGroup[]
  wishlist: readonly CollectionGroup[]
  yourself: boolean
}) {
  const viewing = usePhotoSteps(
    groups.flatMap((group) =>
      group.entries.flatMap((entry) =>
        (entry.photoIds ?? []).map((photoId) => {
          const { entryId, name } = entry.photoShows?.[photoId] ?? entry
          return { photoId, owner, entryId, name }
        }),
      ),
    ),
  )
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
      {!groups.length ? (
        <p className="text-sm text-dim">Your shelf is empty. Add the models you own to your collection.</p>
      ) : (
        <CollectionGroups groups={groups} unit="models" onPhoto={viewing.open} />
      )}
      {wishlist.length ? (
        <section aria-labelledby="player-wishlist-heading" className="space-y-3">
          <h2 id="player-wishlist-heading" className="rubric flex items-center gap-2 border-b border-edge pb-2">
            <Star className="size-4 text-info" aria-hidden /> Wishlist
          </h2>
          <CollectionGroups groups={wishlist} unit="wanted" />
        </section>
      ) : null}
      <PhotoViewer
        entryId={viewing.current?.entryId ?? ''}
        name={viewing.current?.name ?? ''}
        photo={viewing.current}
        onClose={viewing.close}
        onPrevious={viewing.previous}
        onNext={viewing.next}
      />
    </section>
  )
}

function CollectionGroups({
  groups,
  unit,
  onPhoto,
}: {
  groups: readonly CollectionGroup[]
  unit: 'models' | 'wanted'
  onPhoto?: (photoId: string) => void
}) {
  const factions = useQuery(factionIndexQuery())
  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const icon = factions.data?.factions.find((entry) => entry.id === group.catalogueId)?.icon ?? null
        const totals =
          unit === 'wanted'
            ? { wanted: group.models }
            : group.entries.reduce(
                (total, entry) => ({
                  owned: total.owned + entry.models,
                  built: total.built + (entry.built ?? 0),
                  painted: total.painted + (entry.painted ?? 0),
                }),
                { owned: 0, built: 0, painted: 0 },
              )
        return (
          <section key={group.catalogueId ?? 'retired'} aria-label={group.name} className="@container/army space-y-3">
            <header className="flex flex-wrap items-center gap-3 border-b border-edge pb-2">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                {group.catalogueId ? <FactionMark faction={{ slug: group.catalogueId, displayName: group.name, icon }} size="md" /> : null}
                <div className="min-w-0">
                  <h2 className="rubric break-words text-bone">{group.name}</h2>
                  <p className="mt-1 text-xs text-dim">{countLabel(group.entries.length, 'datasheet')}</p>
                </div>
              </div>
              <Counts counts={totals} size="lg" className="w-full @xl/army:w-auto" />
            </header>
            <CollectionCardGrid>
              {group.entries.map((entry) => (
                <CollectionCard
                  key={entry.entryId}
                  data-collection-unit={entry.name}
                  name={entry.name}
                  sheet={group.catalogueId && entry.slug ? { catalogueId: group.catalogueId, slug: entry.slug } : undefined}
                  photo={entry.photoIds && onPhoto ? <EntryPhotos name={entry.name} photoIds={entry.photoIds} onOpen={onPhoto} /> : null}
                >
                  <Counts
                    label={entry.name}
                    counts={
                      unit === 'wanted'
                        ? { wanted: entry.models }
                        : { owned: entry.models, built: entry.built ?? 0, painted: entry.painted ?? 0 }
                    }
                  />
                </CollectionCard>
              ))}
            </CollectionCardGrid>
          </section>
        )
      })}
    </div>
  )
}

/** Read-only counts in the collection page's caption-and-figure style; a card's are named for its datasheet. */
function Counts({
  counts,
  label,
  size = 'base',
  className,
}: {
  counts: Record<string, number>
  label?: string
  size?: 'base' | 'lg'
  className?: string
}) {
  return (
    <dl className={cn('flex flex-wrap gap-x-4 gap-y-1', className)}>
      {Object.entries(counts).map(([caption, value]) => (
        <div key={caption} className="flex items-baseline gap-x-1.5">
          <dt className="text-xs text-dim capitalize">{caption}</dt>
          <dd
            className={`figure text-bone ${size === 'lg' ? 'text-lg' : 'text-base'}`}
            aria-label={label ? `${label}: ${value} ${caption}` : undefined}
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** A collection row's first photo, with how many there are, opening them all. */
function EntryPhotos({ name, photoIds, onOpen }: { name: string; photoIds: readonly string[]; onOpen: (photoId: string) => void }) {
  const [first] = photoIds
  if (!first) return null
  return (
    <button
      type="button"
      className="relative grid size-8 shrink-0 place-items-center overflow-hidden border border-edge bg-sunken hover:border-info"
      aria-label={`Photos of ${name}`}
      onClick={() => onOpen(first)}
    >
      <img src={collectionPhotoPath(first, 'thumbnail')} alt="" loading="lazy" className="size-full object-cover" />
      {photoIds.length > 1 ? (
        <span className="readout absolute right-0 bottom-0 bg-sunken/90 px-1 text-xs text-bone">{photoIds.length}</span>
      ) : null}
    </button>
  )
}
