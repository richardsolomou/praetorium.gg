import { expect, it } from 'vitest'
import { photoRow, photosShowing, rankCollectionPhotos } from './collectionPhotos'

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

it('finds photos of a datasheet kept with a row that counts as it', () => {
  expect(photosShowing({ russ: ['plain', 'demolisher'] }, { demolisher: 'demolisher-sheet' }, 'demolisher-sheet')).toEqual(['demolisher'])
})

it('keeps a row’s variant photos out of its own datasheet', () => {
  expect(photosShowing({ russ: ['plain', 'demolisher'] }, { demolisher: 'demolisher-sheet' }, 'russ')).toEqual(['plain'])
})

it('keeps a photo of an owned datasheet with its own row', () => {
  expect(photoRow('demolisher', ['russ', 'demolisher'], { russ: ['demolisher'] })).toEqual({ entryId: 'demolisher' })
})

it('keeps a photo of a datasheet with the row whose models count as it', () => {
  expect(photoRow('demolisher', ['russ'], { russ: ['demolisher'] })).toEqual({ entryId: 'russ', shows: 'demolisher' })
})

it('starts a row for a photo of a datasheet nothing counts as', () => {
  expect(photoRow('demolisher', ['russ'], {})).toEqual({ entryId: 'demolisher' })
})
