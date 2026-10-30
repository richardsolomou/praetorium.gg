import { compareText } from './text'

/** How many photos a player may add of one datasheet. */
export const MAX_DATASHEET_PHOTOS = 6

/** A datasheet's gallery order: most liked first, then newest, so a new photo still leads the photos nobody has liked. */
export function rankCollectionPhotos<T extends { photoId: string; at: bigint | number; likes: number }>(photos: readonly T[]) {
  return photos.toSorted(
    (left, right) => right.likes - left.likes || Number(BigInt(right.at) - BigInt(left.at)) || compareText(left.photoId, right.photoId),
  )
}

/** A player's photos showing one datasheet, wherever they are kept: its own row, or a row whose models also count as it. */
export function photosShowing(
  photos: Readonly<Record<string, readonly string[]>>,
  shows: Readonly<Record<string, string>>,
  entryId: string,
) {
  return Object.entries(photos).flatMap(([row, photoIds]) => photoIds.filter((photoId) => (shows[photoId] ?? row) === entryId))
}

/** Where a photo of a datasheet is kept: its own row if owned, else a row whose models count as it, else a new row for it. */
export function photoRow(entryId: string, owned: readonly string[], countsAs: Readonly<Record<string, readonly string[]>>) {
  if (owned.includes(entryId)) return { entryId }
  const row = owned.find((id) => countsAs[id]?.includes(entryId))
  return row ? { entryId: row, shows: entryId } : { entryId }
}
