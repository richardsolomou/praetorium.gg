import type { z } from 'zod'
import type { copyRosterSchema, rosterArchiveSchema, rosterVisibilitySchema, saveRosterSchema } from '../contracts/schemas'
import { app } from './app'
import { captureMutation } from './mutationTelemetry'
import { captureRosterCreated } from './rosterTelemetry'
import { copySavedRoster, saveOwnedRoster } from './saveOwnedRoster'

/** Roster writes and their captures, shared by the builder's handlers and the account agent tools. */
export const rosterActions = {
  async save(owner: string, data: z.infer<typeof saveRosterSchema>) {
    const saved = await saveOwnedRoster(owner, data)
    // Counted when a row is made, which a visitor's list does while arriving with the id it was built under.
    if (saved.created) await captureRosterCreated(app(), owner, data)
    return saved
  },
  async setVisibility(owner: string, data: z.infer<typeof rosterVisibilitySchema>) {
    const instance = app()
    await instance.service.rosterService.setRosterVisibility(owner, data.id, data.visibility)
    await captureMutation(owner, 'roster_visibility_updated', { visibility: data.visibility })
  },
  async copy(owner: string, data: z.infer<typeof copyRosterSchema>) {
    const copied = await copySavedRoster(owner, data.id, data.variant, data.setup)
    if (!copied) throw new Response('roster not found', { status: 404 })
    await captureRosterCreated(app(), owner, copied.data, { variant: data.variant })
    return { id: copied.id }
  },
  async delete(owner: string, id: string) {
    await app().service.rosterService.deleteRoster(owner, id)
    await captureMutation(owner, 'roster_deleted')
  },
  async setArchived(owner: string, data: z.infer<typeof rosterArchiveSchema>) {
    const saved = await app().service.rosterService.setRosterArchived(owner, data.id, data.archived)
    await captureMutation(owner, 'roster_archive_updated', { archived: data.archived })
    return saved
  },
}
