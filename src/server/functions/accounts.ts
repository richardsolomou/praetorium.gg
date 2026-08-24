import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { configuredProviders } from 'ras-stack/auth'
import { SOCIAL_PROVIDERS } from '../../authConfig'
import { app } from '../app'
import { currentUser, currentUserId, requireAdmin, requireUser, requireUserId } from '../playerSession'
import { mutationRpc, rpc } from '../rpc'
import {
  favouriteDetachmentSchema,
  favouriteFactionSchema,
  friendSchema,
  ownedSchema,
  setAdminRoleSchema,
  setOwnPasswordSchema,
  unlinkOwnAccountSchema,
  userSchema,
} from '../schemas'

export const me = createServerFn({ method: 'GET' }).handler(() => rpc(() => currentUser()))

export const adminUsers = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    await requireAdmin()
    return app().service.adminUsers()
  }),
)

export const accountMethods = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    await requireUser()
    const linked = await app().auth.api.listUserAccounts({ headers: getRequestHeaders() })
    return {
      linked: linked.map((entry) => entry.providerId),
      availableProviders: configuredProviders(SOCIAL_PROVIDERS),
    }
  }),
)

export const setOwnPassword = createServerFn({ method: 'POST' })
  .validator(setOwnPasswordSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const current = await requireUser()
      const linked = await app().auth.api.listUserAccounts({ headers: getRequestHeaders() })
      if (linked.some((entry) => entry.providerId === 'credential'))
        throw new Response('this account already has a password', { status: 409 })
      await app().auth.api.setPassword({ body: { newPassword: data.password }, headers: getRequestHeaders() })
      await app().telemetry.capture(current.id, 'sign_in_method_added', { provider: 'password' })
      return null
    }),
  )

export const unlinkOwnAccount = createServerFn({ method: 'POST' })
  .validator(unlinkOwnAccountSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const current = await requireUser()
      const result = await app().service.unlinkAccount(current.id, data.provider, ['credential', ...configuredProviders(SOCIAL_PROVIDERS)])
      if (result === 'missing') throw new Response('this sign-in method is not linked', { status: 404 })
      if (result === 'two-factor') throw new Response('disable two-factor authentication before removing your password', { status: 409 })
      if (result === 'last-method') throw new Response('another available sign-in method must stay linked', { status: 409 })
      await app().telemetry.capture(current.id, 'sign_in_method_removed', { provider: data.provider })
      return null
    }),
  )

export const setAdminRole = createServerFn({ method: 'POST' })
  .validator(setAdminRoleSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const current = await requireAdmin()
      if (current.id === data.userId) throw new Response('you cannot change your own administrator role', { status: 409 })
      await app().auth.api.setRole({ body: data, headers: getRequestHeaders() })
      await app().telemetry.capture(current.id, 'admin_user_role_changed', { role: data.role })
      return null
    }),
  )

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
