import { productActions } from '../productActions'
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
import { reportServerFailure } from '../../adapters/posthog'
import { app } from '../app'
import { captureMutation } from '../mutationTelemetry'
import { configuredAuthProviders, githubLinkConfigured } from '../authProviders'
import { currentUser, currentUserId, forSignedIn, requireUser, requireUserId } from '../playerSession'
import { fixedWindowRateLimit } from '../rateLimit'
import { mutationRpc, rpc } from '../rpc'
import { unlinkSignInMethod } from '../signInMethods'
import {
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
  collectionCountsAsSchema,
  favouriteDatasheetSchema,
  userSchema,
  setOwnPasswordSchema,
  unlinkOwnAccountSchema,
} from '../../contracts/schemas'

export const me = createServerFn({ method: 'GET' }).handler(() => rpc(() => currentUser()))

export const onboardingProgress = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => app().service.onboardingProgress(await requireUserId())),
)

export const updateOnboardingProgress = createServerFn({ method: 'POST' })
  .validator(onboardingUpdateSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      return productActions.updateOnboardingProgress(userId, data)
    }),
  )

/** What this player's new rosters and battles start with. */
export const playerDefaults = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => app().service.playerDefaults(await requireUserId())),
)

export const setPlayerDefaults = createServerFn({ method: 'POST' })
  .validator(playerDefaultsSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      return productActions.setPlayerDefaults(userId, data)
    }),
  )

export const accountMethods = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const userId = await requireUserId()
    const [linked, authoritative] = await Promise.all([
      app().auth.api.listUserAccounts({ headers: getRequestHeaders() }),
      app().service.userById(userId),
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
    const userId = await requireUserId()
    const instance = app()
    const [linked, sponsorship] = await Promise.all([
      instance.auth.api.listUserAccounts({ headers: getRequestHeaders() }),
      instance.service.githubSponsorship(userId),
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
    const userId = await requireUserId()
    const instance = app()
    try {
      await instance.githubSponsors.refresh()
    } catch (error) {
      reportServerFailure({ event: 'github_sponsor_refresh_failed', error })
      throw new Response('GitHub could not be reached', { status: 502 })
    }
    const sponsorship = await instance.service.githubSponsorship(userId)
    await instance.telemetry.capture(userId, 'github_sponsorship_checked', { sponsorship: sponsorship ?? 'none' })
    return sponsorship
  }),
)

export const setOwnPassword = createServerFn({ method: 'POST' })
  .validator(setOwnPasswordSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const linked = await app().auth.api.listUserAccounts({ headers: getRequestHeaders() })
      if (linked.some((entry) => entry.providerId === 'credential'))
        throw new Response('this account already has a password', { status: 409 })
      await app().auth.api.setPassword({ body: { newPassword: data.password }, headers: getRequestHeaders() })
      await captureMutation(userId, 'sign_in_method_added', { provider: 'password' })
      return null
    }),
  )

export const unlinkOwnAccount = createServerFn({ method: 'POST' })
  .validator(unlinkOwnAccountSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const status = await unlinkSignInMethod(userId, data.provider)
      if (status === 'missing') {
        throw new Response('this sign-in method is not linked', { status: 404 })
      } else if (status === 'two-factor') {
        throw new Response('disable two-factor authentication before removing your password', { status: 409 })
      } else if (status === 'last-method') {
        throw new Response('another available sign-in method must stay linked', { status: 409 })
      }
      await captureMutation(userId, 'sign_in_method_removed', { provider: data.provider })
      return null
    }),
  )

export const userProfile = createServerFn({ method: 'GET' })
  .validator(userSchema)
  .handler(({ data }) => rpc(() => app().service.userProfile(data.userId)))

export const opponents = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => forSignedIn([], (id) => app().service.socialService.opponents(id))),
)

export const friendships = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => forSignedIn({ friends: [], incoming: [], outgoing: [] }, (id) => app().service.socialService.friendships(id))),
)

export const activeFriendInvite = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => forSignedIn(null, (id) => app().service.socialService.activeFriendInvite(id))),
)

export const friendInvite = createServerFn({ method: 'GET' })
  .validator(friendInviteSchema)
  .handler(({ data }) => rpc(() => app().service.socialService.friendInvite(data.token)))

export const createFriendInvite = createServerFn({ method: 'POST' }).handler(() =>
  mutationRpc(async () => {
    const userId = await requireUserId()
    return productActions.createFriendInvite(userId, {})
  }),
)

export const cancelFriendInvite = createServerFn({ method: 'POST' }).handler(() =>
  mutationRpc(async () => {
    const userId = await requireUserId()
    return productActions.cancelFriendInvite(userId, {})
  }),
)

export const acceptFriendInvite = createServerFn({ method: 'POST' })
  .validator(friendInviteSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      return productActions.acceptFriendInvite(userId, data)
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
      return productActions.requestFriend(userId, data)
    }),
  )

export const acceptFriend = createServerFn({ method: 'POST' })
  .validator(friendSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      return productActions.acceptFriend(userId, data)
    }),
  )

export const rejectFriend = createServerFn({ method: 'POST' })
  .validator(friendSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      return productActions.rejectFriend(userId, data)
    }),
  )

export const removeFriend = createServerFn({ method: 'POST' })
  .validator(friendSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      return productActions.removeFriend(userId, data)
    }),
  )

export const collection = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => forSignedIn([], (id) => app().service.rosterService.collection(id))),
)

export const setOwned = createServerFn({ method: 'POST' })
  .validator(ownedSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      return productActions.setOwned(userId, data)
    }),
  )

export const collectionCounts = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => forSignedIn({}, (id) => app().service.rosterService.collectionCounts(id))),
)

export const fieldedDatasheets = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => forSignedIn([], (id) => app().service.fieldedDatasheets(id))),
)

export const setCollectionModels = createServerFn({ method: 'POST' })
  .validator(collectionModelsSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      return productActions.setCollectionModels(userId, data)
    }),
  )

export const collectionProgress = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => forSignedIn({}, (id) => app().service.rosterService.collectionProgress(id))),
)

export const setCollectionProgress = createServerFn({ method: 'POST' })
  .validator(collectionProgressSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      return productActions.setCollectionProgress(userId, data)
    }),
  )

export const collectionCountsAs = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => forSignedIn({}, (id) => app().service.rosterService.collectionCountsAs(id))),
)

export const setCollectionCountsAs = createServerFn({ method: 'POST' })
  .validator(collectionCountsAsSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      return productActions.setCollectionCountsAs(userId, data)
    }),
  )

export const collectionWishes = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => forSignedIn({}, (id) => app().service.rosterService.collectionWishes(id))),
)

export const setCollectionWanted = createServerFn({ method: 'POST' })
  .validator(collectionWantedSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      return productActions.setCollectionWanted(userId, data)
    }),
  )

export const importCollection = createServerFn({ method: 'POST' })
  .validator(collectionImportSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const result = await app().service.rosterService.importCollection(userId, data.rows, data.replace)
      await captureMutation(userId, 'player_collection_imported', { rows: data.rows.length, replace: data.replace, ...result })
      return result
    }),
  )

export const collectionPhotos = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => forSignedIn({}, (id) => app().service.rosterService.collectionPhotos(id))),
)

/** Photos filed under another datasheet the entry's models count as, by photo id. */
export const collectionPhotoShows = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => forSignedIn({}, (id) => app().service.rosterService.collectionPhotoShows(id))),
)

const photoRateLimit = fixedWindowRateLimit('too many photo uploads', 12)

export const uploadCollectionPhoto = createServerFn({ method: 'POST' })
  .validator(collectionPhotoSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const limited = photoRateLimit(getRequest())
      if (limited) throw limited
      const photoId = await app().collectionPhotos.upload(userId, data.entryId, data.image, data.shows)
      await captureMutation(userId, 'collection_photo_uploaded')
      void recordScreening(app().photoScreening, data.image, COLLECTION_PHOTO_QUESTIONS, (properties) =>
        app().telemetry.capture(userId, 'collection_photo_screened', properties),
      )
      return photoId
    }),
  )

export const removeCollectionPhoto = createServerFn({ method: 'POST' })
  .validator(collectionPhotoIdSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().collectionPhotos.remove(userId, data.photoId)
      await captureMutation(userId, 'collection_photo_removed')
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
      const userId = await requireUserId()
      await app().collectionPhotos.like(userId, data.photoId, data.liked)
      await captureMutation(userId, 'collection_photo_liked', { liked: data.liked })
      return null
    }),
  )

const reportRateLimit = fixedWindowRateLimit('too many photo reports', 3)

/** Holds a photo the reporter can see for review and emails every administrator, where this instance sends email. */
export const reportCollectionPhoto = createServerFn({ method: 'POST' })
  .validator(collectionPhotoReportSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const reporter = await requireUser()
      const limited = reportRateLimit(getRequest())
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
      await captureMutation(reporter.id, 'collection_photo_reported')
      return null
    }),
  )

export const favouriteFactions = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => forSignedIn([], (id) => app().service.rosterService.favouriteFactions(id))),
)

export const setFavouriteFaction = createServerFn({ method: 'POST' })
  .validator(favouriteFactionSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      return productActions.setFavouriteFaction(userId, data)
    }),
  )

export const favouriteDatasheets = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => forSignedIn([], (id) => app().service.rosterService.favouriteDatasheets(id))),
)

export const setFavouriteDatasheet = createServerFn({ method: 'POST' })
  .validator(favouriteDatasheetSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      return productActions.setFavouriteDatasheet(userId, data)
    }),
  )

export const favouriteDetachments = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => forSignedIn([], (id) => app().service.rosterService.favouriteDetachments(id))),
)

export const setFavouriteDetachment = createServerFn({ method: 'POST' })
  .validator(favouriteDetachmentSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      return productActions.setFavouriteDetachment(userId, data)
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
