import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { collectionPhotoPath } from '../../../../contracts/collection'
import { collectionPhotoShowsQuery, collectionPhotosQuery, datasheetPhotosQuery, meQuery } from '../../../queries'
import { photosShowing } from '../../../../core/collectionPhotos'
import { OwnPhotos } from '../../collection/CollectionPhoto'
import { PhotoViewer } from '../../collection/PhotoViewer'

/** The reader's own photos of a datasheet, or else the first one players share, and space for a signed-in reader to add theirs. */
export function UnitPhoto({ entryId, name }: { entryId: string; name: string }) {
  const { data: me } = useQuery(meQuery())
  const photos = useQuery({ ...collectionPhotosQuery(), enabled: Boolean(me) }).data
  const shows = useQuery({ ...collectionPhotoShowsQuery(), enabled: Boolean(me) }).data
  const own = photos && shows && photosShowing(photos, shows, entryId).length > 0
  const shared = useQuery({ ...datasheetPhotosQuery(entryId), enabled: !own }).data?.[0]
  const [viewing, setViewing] = useState(false)
  if (!me && !shared) return null
  return (
    <section className="space-y-2 border-t border-edge pt-3" data-unit-photo>
      <h3 className="eyebrow">{own ? 'Your models' : 'Photos'}</h3>
      {!own && shared ? (
        <figure>
          <button type="button" className="block w-full" aria-label={`View the photo of ${name}`} onClick={() => setViewing(true)}>
            <img src={collectionPhotoPath(shared.photoId)} alt="" className="max-h-56 w-full border border-edge bg-sunken object-cover" />
          </button>
          <figcaption className="mt-1 text-xs text-dim">From {shared.owner.name}’s collection</figcaption>
          <PhotoViewer entryId={entryId} name={name} photo={viewing ? shared : null} onClose={() => setViewing(false)} />
        </figure>
      ) : null}
      <OwnPhotos entryId={entryId} name={name} className="grid-cols-3" />
    </section>
  )
}
