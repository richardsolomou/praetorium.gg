import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { collectionPhotoPath } from '../../../../contracts/collection'
import { datasheetPhotosQuery } from '../../../queries'
import { PhotoLike } from '../../collection/PhotoLike'
import { PhotoViewer, type SharedPhoto } from '../../collection/PhotoViewer'

/**
 * Players' photos of this datasheet from their shared collections, most liked first.
 *
 * Read in the browser only: signed-out reference pages sit in a shared cache and name no player.
 */
export function DatasheetPhotos({ entryId, name }: { entryId: string; name: string }) {
  const photos = useQuery(datasheetPhotosQuery(entryId))
  const [viewing, setViewing] = useState<SharedPhoto | null>(null)
  if (!photos.data) return null
  return (
    <section aria-labelledby="player-photos" data-datasheet-photos>
      <h2 id="player-photos" className="rubric">
        Player photos
      </h2>
      {photos.data.length ? (
        <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
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
        <p className="mt-2 text-sm text-dim">No player photos yet. Add one of your own models from Add to › Collection.</p>
      )}
      <PhotoViewer entryId={entryId} name={name} photo={viewing} onClose={() => setViewing(null)} />
    </section>
  )
}
