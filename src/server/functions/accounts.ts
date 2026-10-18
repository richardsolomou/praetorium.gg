import { groupCollection } from '../../core/collection'
import { createServerFn } from '@tanstack/react-start'
import { getRequest, getRequestHeaders } from '@tanstack/react-start/server'
import {
  collectionPhotoIdSchema,
  collectionPhotoLikeSchema,
  collectionPhotoReportSchema,
  collectionPhotoSchema,
} from '../../contracts/collection'
import { collectionPhotoReportEmail } from '../collectionPhotos'
import { COLLECTION_PHOTO_QUESTIONS, recordScreening } from '../photoScreening'
import { app } from '../app'
import { configuredAuthProviders, githubLinkConfigured } from '../authProviders'
import { currentUser, currentUserId, requireUser, requireUserId } from '../playerSession'
import { fixedWindowRateLimit } from '../rateLimit'
import { mutationRpc, rpc } from '../rpc'
import { unlinkSignInMethod } from '../signInMethods'
import {
  battleAudienceSchema,
  playerDefaultsSchema,
  favouriteDetachmentSchema,
  favouriteFactionSchema,
  friendSchema,
  onboardingUpdateSchema,
  friendInviteSchema,
  playerSearchSchema,
  ownedSchema,
  collectionModelsSchema,
  collectionImportSchema,
  collectionProgressSchema,
  collectionWantedSchema,
  collectionPublishedSchema,
  favouriteDatasheetSchema,
  userSchema,
  setOwnPasswordSchema,
  unlinkOwnAccountSchema,
} from '../../contracts/schemas'

export const me = createServerFn({ method: 'GET' }).handler(() => rpc(() => currentUser()))

const ONBOARDING_TASK_EVENTS = {
  complete: 'onboarding_task_completed',
  skip: 'onboarding_task_skipped',
  restore: 'onboarding_task_restored',
} as const

export const onboardingProgress = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => app().service.onboardingProgress(await requireUserId())),
)

export const updateOnboardingProgress = createServerFn({ method: 'POST' })
  .validator(onboardingUpdateSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      const progress = await app().service.updateOnboardingProgress(player.id, data)
      if (data.operation === 'welcome') await app().telemetry.capture(player.id, 'onboarding_welcomed')
      else await app().telemetry.capture(player.id, ONBOARDING_TASK_EVENTS[data.operation], { task: data.task })
      return progress
    }),
  )

/** How widely this player's battles may be seen. */
export const battleAudience = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => app().service.battleAudience(await requireUserId())),
)

/** What this player's new rosters and battles start with. */
export const playerDefaults = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => app().service.playerDefaults(await requireUserId())),
)

export const setPlayerDefaults = createServerFn({ method: 'POST' })
  .validator(playerDefaultsSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      const defaults = await app().service.setPlayerDefaults(player.id, data)
      await app().telemetry.capture(player.id, 'player_defaults_set', {
        roster_visibility: defaults.rosterVisibility,
        battle_size: defaults.battleSize,
      })
      return defaults
    }),
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

/** Whether this player's linked GitHub account sponsors the project, for their own settings. */
export const githubSponsorship = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const current = await requireUser()
    const instance = app()
    const [linked, sponsorship] = await Promise.all([
      instance.auth.api.listUserAccounts({ headers: getRequestHeaders() }),
      instance.service.githubSponsorship(current.id),
    ])
    return {
      available: githubLinkConfigured() && instance.githubSponsors.configured,
      linked: linked.some((entry) => entry.providerId === 'github'),
      sponsorship,
    }
  }),
)

export const checkGithubSponsorship = createServerFn({ method: 'POST' }).handler(() =>
  mutationRpc(async () => {
    const current = await requireUser()
    const instance = app()
    try {
      await instance.githubSponsors.refresh()
    } catch {
      throw new Response('GitHub could not be reached', { status: 502 })
    }
    const sponsorship = await instance.service.githubSponsorship(current.id)
    await instance.telemetry.capture(current.id, 'github_sponsorship_checked', { sponsorship: sponsorship ?? 'none' })
    return sponsorship
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
      const status = await unlinkSignInMethod(current.id, data.provider)
      if (status === 'missing') {
        throw new Response('this sign-in method is not linked', { status: 404 })
      } else if (status === 'two-factor') {
        throw new Response('disable two-factor authentication before removing your password', { status: 409 })
      } else if (status === 'last-method') {
        throw new Response('another available sign-in method must stay linked', { status: 409 })
      }
      await app().telemetry.capture(current.id, 'sign_in_method_removed', { provider: data.provider })
      return null
    }),
  )

export const userProfile = createServerFn({ method: 'GET' })
  .validator(userSchema)
  .handler(({ data }) => rpc(() => app().service.userProfile(data.userId)))

export const opponents = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentUserId()
    return id ? app().service.socialService.opponents(id) : []
  }),
)

export const friendships = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentUserId()
    return id ? app().service.socialService.friendships(id) : { friends: [], incoming: [], outgoing: [] }
  }),
)

export const activeFriendInvite = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentUserId()
    return id ? app().service.socialService.activeFriendInvite(id) : null
  }),
)

export const friendInvite = createServerFn({ method: 'GET' })
  .validator(friendInviteSchema)
  .handler(({ data }) => rpc(() => app().service.socialService.friendInvite(data.token)))

export const createFriendInvite = createServerFn({ method: 'POST' }).handler(() =>
  mutationRpc(async () => {
    const userId = await requireUserId()
    const invite = await app().service.socialService.createFriendInvite(userId)
    await app().telemetry.capture(userId, 'friend_invite_created')
    return invite
  }),
)

export const cancelFriendInvite = createServerFn({ method: 'POST' }).handler(() =>
  mutationRpc(async () => {
    const userId = await requireUserId()
    await app().service.socialService.cancelFriendInvite(userId)
    await app().telemetry.capture(userId, 'friend_invite_cancelled')
    return null
  }),
)

export const acceptFriendInvite = createServerFn({ method: 'POST' })
  .validator(friendInviteSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.socialService.acceptFriendInvite(userId, data.token)
      await app().telemetry.capture(userId, 'friend_invite_accepted')
      return null
    }),
  )

/** The players a name could mean, for someone with a friend to add. */
export const searchPlayers = createServerFn({ method: 'GET' })
  .validator(playerSearchSchema)
  .handler(({ data }) => rpc(async () => app().service.socialService.searchPlayers(await requireUserId(), data.query)))

export const requestFriend = createServerFn({ method: 'POST' })
  .validator(friendSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const result = await app().service.socialService.requestFriend(userId, data.userId)
      await app().telemetry.capture(userId, 'friend_request_sent')
      return result
    }),
  )

export const acceptFriend = createServerFn({ method: 'POST' })
  .validator(friendSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const result = await app().service.socialService.acceptFriend(userId, data.userId)
      await app().telemetry.capture(userId, 'friend_request_accepted')
      return result
    }),
  )

export const rejectFriend = createServerFn({ method: 'POST' })
  .validator(friendSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const result = await app().service.socialService.rejectFriend(userId, data.userId)
      await app().telemetry.capture(userId, 'friend_request_rejected')
      return result
    }),
  )

export const removeFriend = createServerFn({ method: 'POST' })
  .validator(friendSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const result = await app().service.socialService.removeFriend(userId, data.userId)
      await app().telemetry.capture(userId, 'friendship_removed')
      return result
    }),
  )

export const collection = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentUserId()
    return id ? app().service.rosterService.collection(id) : []
  }),
)

export const setOwned = createServerFn({ method: 'POST' })
  .validator(ownedSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      const result = await app().service.rosterService.setOwned(player.id, data.entryId, data.owned)
      await app().telemetry.capture(player.id, 'player_collection_updated', { owned: data.owned })
      return result
    }),
  )

export const collectionCounts = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentUserId()
    const counts: Record<string, number> = id ? await app().service.rosterService.collectionCounts(id) : {}
    return counts
  }),
)

export const fieldedDatasheets = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentUserId()
    return id ? app().service.fieldedDatasheets(id) : []
  }),
)

export const setCollectionModels = createServerFn({ method: 'POST' })
  .validator(collectionModelsSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      await app().service.rosterService.setCollectionModels(player.id, data.entryId, data.models)
      await app().telemetry.capture(player.id, 'player_collection_counted', { models: data.models })
    }),
  )

export const collectionProgress = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentUserId()
    const progress: Record<string, { built: number; painted: number }> = id ? await app().service.rosterService.collectionProgress(id) : {}
    return progress
  }),
)

export const setCollectionProgress = createServerFn({ method: 'POST' })
  .validator(collectionProgressSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      await app().service.rosterService.setCollectionProgress(player.id, data.entryId, { built: data.built, painted: data.painted })
      await app().telemetry.capture(player.id, 'player_collection_progressed', { built: data.built, painted: data.painted })
    }),
  )

export const collectionWishes = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentUserId()
    const wishes: Record<string, number> = id ? await app().service.rosterService.collectionWishes(id) : {}
    return wishes
  }),
)

export const setCollectionWanted = createServerFn({ method: 'POST' })
  .validator(collectionWantedSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      await app().service.rosterService.setCollectionWanted(player.id, data.entryId, data.wanted)
      await app().telemetry.capture(player.id, 'player_collection_wished', { wanted: data.wanted })
    }),
  )

export const importCollection = createServerFn({ method: 'POST' })
  .validator(collectionImportSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      const result = await app().service.rosterService.importCollection(player.id, data.rows, data.replace)
      await app().telemetry.capture(player.id, 'player_collection_imported', { rows: data.rows.length, replace: data.replace, ...result })
      return result
    }),
  )

export const collectionPhotos = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentUserId()
    const photos: Record<string, string[]> = id ? await app().service.rosterService.collectionPhotos(id) : {}
    return photos
  }),
)

const photoRateLimit = fixedWindowRateLimit('too many photo uploads')

export const uploadCollectionPhoto = createServerFn({ method: 'POST' })
  .validator(collectionPhotoSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      const limited = photoRateLimit(getRequest(), 12)
      if (limited) throw limited
      const photoId = await app().collectionPhotos.upload(player.id, data.entryId, data.image)
      await app().telemetry.capture(player.id, 'collection_photo_uploaded')
      void recordScreening(app().photoScreening, data.image, COLLECTION_PHOTO_QUESTIONS, (properties) =>
        app().telemetry.capture(player.id, 'collection_photo_screened', { photo_id: photoId, ...properties }),
      )
      return photoId
    }),
  )

export const removeCollectionPhoto = createServerFn({ method: 'POST' })
  .validator(collectionPhotoIdSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      await app().collectionPhotos.remove(player.id, data.photoId)
      await app().telemetry.capture(player.id, 'collection_photo_removed')
      return null
    }),
  )

export const datasheetPhotos = createServerFn({ method: 'GET' })
  .validator(collectionPhotoSchema.pick({ entryId: true }))
  .handler(({ data }) => rpc(async () => app().collectionPhotos.gallery(data.entryId, await currentUserId())))

export const likeCollectionPhoto = createServerFn({ method: 'POST' })
  .validator(collectionPhotoLikeSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      await app().collectionPhotos.like(player.id, data.photoId, data.liked)
      await app().telemetry.capture(player.id, 'collection_photo_liked', { liked: data.liked })
      return null
    }),
  )

const reportRateLimit = fixedWindowRateLimit('too many photo reports')

/** Holds a photo the reporter can see for review and emails every administrator, where this instance sends email. */
export const reportCollectionPhoto = createServerFn({ method: 'POST' })
  .validator(collectionPhotoReportSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const reporter = await requireUser()
      const limited = reportRateLimit(getRequest(), 3)
      if (limited) throw limited
      const photo = await app().collectionPhotos.visibleTo(data.photoId, reporter.id)
      if (!photo) throw new Response('that photo is no longer shown', { status: 404 })
      await app().collectionPhotos.report(reporter.id, data.photoId)
      const delivery = app().email
      if (delivery && process.env.APP_URL) {
        const email = collectionPhotoReportEmail({ ...data, ownerId: photo.userId }, reporter, process.env.APP_URL)
        const recipients = await app().service.adminEmails()
        await Promise.all(recipients.map((to) => delivery.send({ to, ...email })))
      }
      await app().telemetry.capture(reporter.id, 'collection_photo_reported')
      return null
    }),
  )

export const favouriteFactions = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentUserId()
    return id ? app().service.rosterService.favouriteFactions(id) : []
  }),
)

export const setFavouriteFaction = createServerFn({ method: 'POST' })
  .validator(favouriteFactionSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      await app().service.rosterService.setFavouriteFaction(player.id, data.catalogueId, data.favourite)
      await app().telemetry.capture(player.id, 'favourite_faction_updated', { favourite: data.favourite })
      return null
    }),
  )

export const favouriteDatasheets = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentUserId()
    return id ? app().service.rosterService.favouriteDatasheets(id) : []
  }),
)

export const setFavouriteDatasheet = createServerFn({ method: 'POST' })
  .validator(favouriteDatasheetSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      await app().service.rosterService.setFavouriteDatasheet(player.id, data.entryId, data.favourite)
      await app().telemetry.capture(player.id, 'favourite_datasheet_updated', { favourite: data.favourite })
      return null
    }),
  )

export const favouriteDetachments = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentUserId()
    return id ? app().service.rosterService.favouriteDetachments(id) : []
  }),
)

export const setFavouriteDetachment = createServerFn({ method: 'POST' })
  .validator(favouriteDetachmentSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      await app().service.rosterService.setFavouriteDetachment(player.id, data.catalogueId, data.detachmentId, data.favourite)
      await app().telemetry.capture(player.id, 'favourite_detachment_updated', { favourite: data.favourite })
      return null
    }),
  )

export const signInOptions = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => ({ providers: configuredAuthProviders(), passwordReset: Boolean(app().email) })),
)

export const collectionProfile = createServerFn({ method: 'GET' })
  .validator(userSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const profileCollection = await app().service.collectionProfile(data.userId, await currentUserId())
      if (!profileCollection) return null
      const factions = await app().combatUnitsFor()
      return {
        ...profileCollection,
        groups: groupCollection(profileCollection.entries, factions),
        wishlist: groupCollection(
          profileCollection.wishes.map((wish) => ({ entryId: wish.entryId, models: wish.wanted })),
          factions,
        ),
      }
    }),
  )

export const setCollectionPublished = createServerFn({ method: 'POST' })
  .validator(collectionPublishedSchema)
  .handler(({ data }) => mutationRpc(async () => app().service.setCollectionPublished(await requireUserId(), data.published)))
