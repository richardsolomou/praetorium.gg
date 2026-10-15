import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { collectionPhotoPath } from '../../../../contracts/collection'
import { collectionPhotosQuery, datasheetPhotosQuery, meQuery } from '../../../queries'
import { PhotoViewer } from '../../collection/PhotoViewer'

/** The reader's own photo of a datasheet, or else the first one players share; nothing when there is neither. */
export function UnitPhoto({ entryId, name }: { entryId: string; name: string }) {
  const { data: me } = useQuery(meQuery())
  const own = useQuery({ ...collectionPhotosQuery(), enabled: Boolean(me) }).data?.[entryId]
  const shared = useQuery({ ...datasheetPhotosQuery(entryId), enabled: !own }).data?.[0]
  const [viewing, setViewing] = useState(false)
  const photoId = own ?? shared?.photoId
  if (!photoId) return null
  return (
    <figure className="border-t border-edge pt-3" data-unit-photo>
      <button type="button" className="block w-full" aria-label={`View the photo of ${name}`} onClick={() => setViewing(true)}>
        <img src={collectionPhotoPath(photoId)} alt="" className="max-h-56 w-full border border-edge bg-sunken object-cover" />
      </button>
      <figcaption className="mt-1 text-xs text-dim">{own ? 'Your models' : `From ${shared!.owner.name}’s collection`}</figcaption>
      <PhotoViewer
        name={name}
        photo={viewing ? (own && me ? { photoId: own, owner: { id: me.id, name: me.name } } : shared!) : null}
        onClose={() => setViewing(false)}
      />
    </figure>
  )
}
