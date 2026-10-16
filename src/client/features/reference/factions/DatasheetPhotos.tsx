import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { collectionPhotoPath } from '../../../../contracts/collection'
import { datasheetPhotosQuery, meQuery } from '../../../queries'
import { PhotoDropZone } from '../../collection/PhotoDropZone'
import { PhotoLike } from '../../collection/PhotoLike'
import { PhotoViewer, type SharedPhoto } from '../../collection/PhotoViewer'

/**
 * Players' photos of this datasheet from their shared collections, most liked first, led by space for a signed-in reader to add theirs.
 *
 * Read in the browser only: signed-out reference pages sit in a shared cache and name no player.
 */
export function DatasheetPhotos({ entryId, name }: { entryId: string; name: string }) {
  const photos = useQuery(datasheetPhotosQuery(entryId))
  const { data: me } = useQuery(meQuery())
  const [viewing, setViewing] = useState<SharedPhoto | null>(null)
  if (!photos.data) return null
  return (
    <section aria-labelledby="player-photos" data-datasheet-photos>
      <h2 id="player-photos" className="rubric">
        Player photos
      </h2>
      {me ? <p className="mt-1 text-sm text-dim">Only add photos you took. Adding one puts this datasheet in your collection.</p> : null}
      {photos.data.length || me ? (
        <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {me ? (
            <li>
              <PhotoDropZone entryId={entryId} name={name} className="aspect-square" />
            </li>
          ) : null}
          {photos.data.map((photo) => (
            <li key={photo.photoId}>
              <button
                type="button"
                className="group block w-full"
                aria-label={`${name} from ${photo.owner.name}’s collection`}
                onClick={() => setViewing(photo)}
              >
                <img
                  src={collectionPhotoPath(photo.photoId)}
                  alt=""
                  loading="lazy"
                  className="aspect-square w-full border border-edge bg-sunken object-cover group-hover:border-info"
                />
              </button>
              <div className="flex items-center justify-between gap-1">
                <span className="min-w-0 truncate text-xs text-dim">{photo.owner.name}</span>
                <PhotoLike entryId={entryId} photoId={photo.photoId} name={name} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-dim">No player photos yet.</p>
      )}
      <PhotoViewer entryId={entryId} name={name} photo={viewing} onClose={() => setViewing(null)} />
    </section>
  )
}
