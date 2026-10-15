import { expect, it } from 'vitest'
import { rankCollectionPhotos } from './collectionPhotos'

const ids = (photos: { photoId: string }[]) => photos.map((photo) => photo.photoId)

it('puts the most liked photo first', () => {
  expect(
    ids(
      rankCollectionPhotos([
        { photoId: 'newer', at: 2, likes: 0 },
        { photoId: 'liked', at: 1, likes: 3 },
      ]),
    ),
  ).toEqual(['liked', 'newer'])
})

it('orders photos with the same likes newest first', () => {
  expect(
    ids(
      rankCollectionPhotos([
        { photoId: 'older', at: 1n, likes: 1 },
        { photoId: 'newer', at: 2n, likes: 1 },
      ]),
    ),
  ).toEqual(['newer', 'older'])
})

it('breaks a full tie by photo id so every reader sees one order', () => {
  expect(
    ids(
      rankCollectionPhotos([
        { photoId: 'b', at: 1, likes: 0 },
        { photoId: 'a', at: 1, likes: 0 },
      ]),
    ),
  ).toEqual(['a', 'b'])
})
