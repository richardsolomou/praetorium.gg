import type { z } from 'zod'
import type { rosterVisibilitySchema, saveRosterSchema } from '../contracts/schemas'
import { app } from './app'
import { captureMutation } from './mutationTelemetry'
import { captureRosterCreated } from './rosterTelemetry'
import { saveOwnedRoster } from './saveOwnedRoster'

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
}
