import { createServerFn } from '@tanstack/react-start'
import { configuredProviders } from 'ras-stack/auth'
import { SOCIAL_PROVIDERS } from '../../authConfig'
import { app } from '../app'
import { currentUser, currentUserId, requireUser, requireUserId } from '../playerSession'
import { mutationRpc, rpc } from '../rpc'
import { favouriteDetachmentSchema, favouriteFactionSchema, friendSchema, ownedSchema, userSchema } from '../schemas'

export const me = createServerFn({ method: 'GET' }).handler(() => rpc(() => currentUser()))

export const userProfile = createServerFn({ method: 'GET' })
  .validator(userSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const viewerId = await currentUserId()
      return viewerId ? app().service.userProfile(viewerId, data.userId) : null
    }),
  )

export const opponents = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentUserId()
    return id ? app().service.opponents(id) : []
  }),
)

export const friendships = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentUserId()
    return id ? app().service.friendships(id) : { friends: [], incoming: [], outgoing: [], people: [] }
  }),
)

export const requestFriend = createServerFn({ method: 'POST' })
  .validator(friendSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const result = await app().service.requestFriend(userId, data.userId)
      await app().telemetry.capture(userId, 'friend_request_sent')
      return result
    }),
  )

export const acceptFriend = createServerFn({ method: 'POST' })
  .validator(friendSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const result = await app().service.acceptFriend(userId, data.userId)
      await app().telemetry.capture(userId, 'friend_request_accepted')
      return result
    }),
  )

export const removeFriend = createServerFn({ method: 'POST' })
  .validator(friendSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const result = await app().service.removeFriend(userId, data.userId)
      await app().telemetry.capture(userId, 'friendship_removed')
      return result
    }),
  )

export const collection = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentUserId()
    return id ? app().service.collection(id) : []
  }),
)

export const setOwned = createServerFn({ method: 'POST' })
  .validator(ownedSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      const result = await app().service.setOwned(player.id, data.entryId, data.owned)
      await app().telemetry.capture(player.id, 'player_collection_updated', { owned: data.owned })
      return result
    }),
  )

export const favouriteFactions = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentUserId()
    return id ? app().service.favouriteFactions(id) : []
  }),
)

export const setFavouriteFaction = createServerFn({ method: 'POST' })
  .validator(favouriteFactionSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      await app().service.setFavouriteFaction(player.id, data.catalogueId, data.favourite)
      await app().telemetry.capture(player.id, 'favourite_faction_updated', { favourite: data.favourite })
      return null
    }),
  )

export const favouriteDetachments = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentUserId()
    return id ? app().service.favouriteDetachments(id) : []
  }),
)

export const setFavouriteDetachment = createServerFn({ method: 'POST' })
  .validator(favouriteDetachmentSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      await app().service.setFavouriteDetachment(player.id, data.catalogueId, data.detachmentId, data.favourite)
      await app().telemetry.capture(player.id, 'favourite_detachment_updated', { favourite: data.favourite })
      return null
    }),
  )

export const signInOptions = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => ({ providers: configuredProviders(SOCIAL_PROVIDERS) })),
)
