import { withMember } from './collections'

export type FavouriteDetachment = { catalogueId: string; detachmentId: string }

export const favouriteDetachmentKey = (catalogueId: string, detachmentId: string) => JSON.stringify([catalogueId, detachmentId])

export const withFavouriteDetachment = (
  favourites: readonly FavouriteDetachment[],
  { catalogueId, detachmentId, favourite }: FavouriteDetachment & { favourite: boolean },
) =>
  withMember(favourites, { catalogueId, detachmentId }, favourite, (entry) => favouriteDetachmentKey(entry.catalogueId, entry.detachmentId))
