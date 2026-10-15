/** A datasheet's gallery order: most liked first, then newest, so a new photo still leads the photos nobody has liked. */
export function rankCollectionPhotos<T extends { photoId: string; at: bigint | number; likes: number }>(photos: readonly T[]) {
  return photos.toSorted(
    (left, right) => right.likes - left.likes || Number(BigInt(right.at) - BigInt(left.at)) || left.photoId.localeCompare(right.photoId),
  )
}
