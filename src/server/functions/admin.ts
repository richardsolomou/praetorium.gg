import { createServerFn } from '@tanstack/react-start'
import { app } from '../app'
import type { AdminAction } from '../../admin'
import { requireAdmin } from '../playerSession'
import { mutationRpc, rpc } from '../rpc'
import {
  adminBattleSchema,
  adminConnectionSchema,
  adminRenameSchema,
  adminSessionSchema,
  adminUnlinkSchema,
  adminUsersSchema,
  setAdminRoleSchema,
  userSchema,
} from '../../contracts/schemas'
import { unlinkSignInMethod } from '../signInMethods'
import { adminCollectionPhotosSchema, collectionPhotoIdSchema } from '../../contracts/collection'
import { collectionDatasheets } from '../../core/collection'

/** Every administrator action is counted under one event, named by what was done. */
const track = (actorId: string, action: AdminAction) => app().telemetry.capture(actorId, 'admin_action', { action })

function found<T>(value: T | null | undefined | false, what = 'the user does not exist'): T {
  if (!value) throw new Response(what, { status: 404 })
  return value
}

export const adminUsers = createServerFn({ method: 'GET' })
  .validator(adminUsersSchema)
  .handler(({ data }) =>
    rpc(async () => {
      await requireAdmin()
      return app().repository.adminUsers(data)
    }),
  )

export const setAdminRole = createServerFn({ method: 'POST' })
  .validator(setAdminRoleSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const adminId = await requireAdmin()
      const result = await app().auth.changeUserRole(adminId, data.userId, data.role)
      if (result === 'forbidden') throw new Response('admin access required', { status: 403 })
      if (result === 'self') throw new Response('you cannot change your own administrator role', { status: 409 })
      if (result === 'last-admin') throw new Response('at least one administrator must remain', { status: 409 })
      found(result !== 'missing')
      await track(adminId, 'role-changed')
      return null
    }),
  )

export const deleteUserAsAdmin = createServerFn({ method: 'POST' })
  .validator(userSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const adminId = await requireAdmin()
      const result = await app().auth.deleteUserAsAdmin(adminId, data.userId)
      if (result === 'forbidden') throw new Response('admin access required', { status: 403 })
      if (result === 'self') throw new Response('delete your own account from your profile', { status: 409 })
      if (result === 'admin') throw new Response('remove the administrator role before deleting the account', { status: 409 })
      found(result !== 'missing')
      await track(adminId, 'user-deleted')
      return null
    }),
  )

export const adminUserSessions = createServerFn({ method: 'GET' })
  .validator(userSchema)
  .handler(({ data }) =>
    rpc(async () => {
      await requireAdmin()
      return app().auth.userSessions(data.userId)
    }),
  )

export const revokeSessionAsAdmin = createServerFn({ method: 'POST' })
  .validator(adminSessionSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const adminId = await requireAdmin()
      found(await app().auth.revokeUserSession(data.userId, data.sessionId), 'that session has already ended')
      await track(adminId, 'session-revoked')
      return null
    }),
  )

export const revokeSessionsAsAdmin = createServerFn({ method: 'POST' })
  .validator(userSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const adminId = await requireAdmin()
      await app().auth.revokeAllUserSessions(data.userId)
      await track(adminId, 'sessions-revoked')
      return null
    }),
  )

export const renameUserAsAdmin = createServerFn({ method: 'POST' })
  .validator(adminRenameSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const adminId = await requireAdmin()
      found(await app().service.userById(data.userId))
      const result = await app().auth.moderateProfile(data.userId, { name: data.name })
      if (!result.ok) throw new Response(result.error, { status: 400 })
      await track(adminId, 'profile-renamed')
      return null
    }),
  )

export const removeUserImageAsAdmin = createServerFn({ method: 'POST' })
  .validator(userSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const adminId = await requireAdmin()
      const result = await app().auth.moderateProfile(data.userId, { image: null })
      if (!result.ok) throw new Response(result.error, { status: 404 })
      await track(adminId, 'profile-image-removed')
      return null
    }),
  )

export const markEmailVerifiedAsAdmin = createServerFn({ method: 'POST' })
  .validator(userSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const adminId = await requireAdmin()
      found(await app().auth.markEmailVerified(data.userId))
      await track(adminId, 'email-verified')
      return null
    }),
  )

export const sendVerificationEmailAsAdmin = createServerFn({ method: 'POST' })
  .validator(userSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const adminId = await requireAdmin()
      if (!app().email) throw new Response('this instance does not send email', { status: 409 })
      found(await app().auth.sendVerificationEmailTo(data.userId))
      await track(adminId, 'verification-sent')
      return null
    }),
  )

export const sendPasswordResetAsAdmin = createServerFn({ method: 'POST' })
  .validator(userSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const adminId = await requireAdmin()
      if (!app().email) throw new Response('this instance does not send email', { status: 409 })
      found(await app().auth.sendPasswordResetTo(data.userId))
      await track(adminId, 'password-reset-sent')
      return null
    }),
  )

export const unlinkSignInMethodAsAdmin = createServerFn({ method: 'POST' })
  .validator(adminUnlinkSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const adminId = await requireAdmin()
      const status = await unlinkSignInMethod(data.userId, data.provider)
      found(status !== 'missing', 'that sign-in method is not linked')
      if (status === 'two-factor')
        throw new Response('the player must turn off two-factor before their password is removed', { status: 409 })
      if (status === 'last-method') throw new Response('another available sign-in method must stay linked', { status: 409 })
      await track(adminId, 'sign-in-method-unlinked')
      return null
    }),
  )

export const adminUserConnections = createServerFn({ method: 'GET' })
  .validator(userSchema)
  .handler(({ data }) =>
    rpc(async () => {
      await requireAdmin()
      return app().auth.mcpConnectionsFor(data.userId)
    }),
  )

export const revokeConnectionAsAdmin = createServerFn({ method: 'POST' })
  .validator(adminConnectionSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const adminId = await requireAdmin()
      await app().auth.revokeMcpConsent(data.userId, data.connectionId)
      await track(adminId, 'connection-revoked')
      return null
    }),
  )

export const adminPlayerBattles = createServerFn({ method: 'GET' })
  .validator(userSchema)
  .handler(({ data }) =>
    rpc(async () => {
      await requireAdmin()
      return app().service.adminPlayerBattles(data.userId)
    }),
  )

export const deleteBattleAsAdmin = createServerFn({ method: 'POST' })
  .validator(adminBattleSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const adminId = await requireAdmin()
      found(await app().service.deleteBattleAsAdmin(data.battle), 'that battle does not exist')
      await track(adminId, 'battle-deleted')
      return null
    }),
  )

export const heldCollectionPhotos = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    await requireAdmin()
    return withDatasheetNames(await app().collectionPhotos.held())
  }),
)

export const adminCollectionPhotos = createServerFn({ method: 'GET' })
  .validator(adminCollectionPhotosSchema)
  .handler(({ data }) =>
    rpc(async () => {
      await requireAdmin()
      const page = await app().collectionPhotos.browse(data.before)
      return { ...page, photos: await withDatasheetNames(page.photos) }
    }),
  )

/** Names each photo's datasheet and faction, as the collection names one the current rules no longer have. */
async function withDatasheetNames<Photo extends { entryId: string }>(photos: Photo[]) {
  const sheets = collectionDatasheets(await app().combatUnitsFor())
  return photos.map((photo) => {
    const sheet = sheets.get(photo.entryId)
    return {
      ...photo,
      name: sheet?.name ?? 'A datasheet from earlier rules',
      sheet: sheet ? { catalogueId: sheet.catalogueId, slug: sheet.slug, faction: sheet.faction } : null,
    }
  })
}

export const keepCollectionPhotoAsAdmin = createServerFn({ method: 'POST' })
  .validator(collectionPhotoIdSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const adminId = await requireAdmin()
      await app().collectionPhotos.keep(data.photoId)
      await track(adminId, 'collection-photo-kept')
      return null
    }),
  )

export const removeCollectionPhotoAsAdmin = createServerFn({ method: 'POST' })
  .validator(collectionPhotoIdSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const adminId = await requireAdmin()
      await app().collectionPhotos.removeById(data.photoId)
      await track(adminId, 'collection-photo-removed')
      return null
    }),
  )
