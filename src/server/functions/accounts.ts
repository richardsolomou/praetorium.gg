import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { app } from '../app'
import { configuredAuthProviders } from '../authProviders'
import { currentUser, currentUserId, requireAdmin, requireUser, requireUserId } from '../playerSession'
import { mutationRpc, rpc } from '../rpc'
import {
  battleAudienceSchema,
  favouriteDetachmentSchema,
  favouriteFactionSchema,
  friendSchema,
  adminUsersSchema,
  ownedSchema,
  setAdminRoleSchema,
  userSchema,
  setOwnPasswordSchema,
  unlinkOwnAccountSchema,
} from '../schemas'

export const me = createServerFn({ method: 'GET' }).handler(() => rpc(() => currentUser()))

/** How widely this player's battles may be seen. */
export const battleAudience = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => app().service.battleAudience(await requireUserId())),
)

export const setBattleAudience = createServerFn({ method: 'POST' })
  .validator(battleAudienceSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      const audience = await app().service.setBattleAudience(player.id, data.audience)
      await app().telemetry.capture(player.id, 'battle_audience_set', { audience })
      return audience
    }),
  )

export const adminUsers = createServerFn({ method: 'GET' })
  .validator(adminUsersSchema)
  .handler(({ data }) =>
    rpc(async () => {
      await requireAdmin()
      return app().service.adminUsers(data)
    }),
  )

export const accountMethods = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const current = await requireUser()
    const [linked, authoritative] = await Promise.all([
      app().auth.api.listUserAccounts({ headers: getRequestHeaders() }),
      app().service.userById(current.id),
    ])
    return {
      linked: linked.map((entry) => entry.providerId),
      availableProviders: configuredAuthProviders(),
      emailDelivery: Boolean(app().email),
      emailVerified: Boolean(authoritative?.emailVerified),
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
      const instance = app()
      const result = await instance.service.unlinkAccount(current.id, data.provider, ['credential', ...configuredAuthProviders()])
      if (result.status === 'removed') {
        if (data.provider === 'apple') await instance.auth.revokeAppleTokens(result.account)
      } else if (result.status === 'missing') {
        throw new Response('this sign-in method is not linked', { status: 404 })
      } else if (result.status === 'two-factor') {
        throw new Response('disable two-factor authentication before removing your password', { status: 409 })
      } else {
        throw new Response('another available sign-in method must stay linked', { status: 409 })
      }
      await app().telemetry.capture(current.id, 'sign_in_method_removed', { provider: data.provider })
      return null
    }),
  )

export const setAdminRole = createServerFn({ method: 'POST' })
  .validator(setAdminRoleSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const current = await requireAdmin()
      const result = await app().auth.changeUserRole(current.id, data.userId, data.role)
      if (result === 'forbidden') throw new Response('admin access required', { status: 403 })
      if (result === 'self') throw new Response('you cannot change your own administrator role', { status: 409 })
      if (result === 'last-admin') throw new Response('at least one administrator must remain', { status: 409 })
      if (result === 'missing') throw new Response('the user does not exist', { status: 404 })
      await app().telemetry.capture(current.id, 'admin_user_role_changed', { role: data.role })
      return null
    }),
  )

export const userProfile = createServerFn({ method: 'GET' })
  .validator(userSchema)
  .handler(({ data }) => rpc(() => app().service.userProfile(data.userId)))

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
  rpc(() => ({ providers: configuredAuthProviders(), passwordReset: Boolean(app().email) })),
)
