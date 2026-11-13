import { z } from 'zod'
import type { PlayerDefaults } from '../../core/playerDefaults'
import type { CalendarFeedDates } from '../../core/calendarFeed'
import { listPreferencesSchema, type ListFilterScope, type ListPreferences } from '../../core/listFilter'
import { playerDefaultsSchema } from '../../contracts/schemas'
import { recentMatchupSchema, type RecentMatchup } from '../../core/recentMatchups'
import { abilityReminderSchema, type AbilityReminder } from '../../core/reminders'
import { unitLoadoutSchema, type UnitLoadout } from '../../core/unitLoadouts'
import type { SpacetimeBase } from './client'

const calendarFeedDates = z.object({
  leagues: z.array(
    z.object({ groupToken: z.string(), groupName: z.string(), publishedAt: z.number(), deadlines: z.array(z.number().nullable()) }),
  ),
  tournaments: z.array(z.object({ token: z.string(), name: z.string(), playsAt: z.number().nullable(), sealBy: z.number().nullable() })),
}) satisfies z.ZodType<CalendarFeedDates>
const recentMatchupRow = recentMatchupSchema.extend({ at: z.number().int() })
const favouriteDatasheetRow = z.object({ userId: z.string(), entryId: z.string(), at: z.number().int() })
const favouriteFactionRow = z.object({ userId: z.string(), catalogueId: z.string(), at: z.number().int() })
const favouriteDetachmentRow = z.object({
  userId: z.string(),
  catalogueId: z.string(),
  detachmentId: z.string(),
  at: z.number().int(),
})
const unitLoadoutRow = unitLoadoutSchema.extend({ id: z.string(), name: z.string(), catalogueId: z.string(), createdAt: z.number().int() })

/** Favourites, saved loadouts, matchups, reminders, list filters and player defaults. */
export function withPreferences<B extends SpacetimeBase>(Base: B) {
  return class PreferenceOperations extends Base {
    async favouriteFactionsByUser(userId: string) {
      return this.read('favourite_factions_by_user', [userId], z.array(favouriteFactionRow))
    }

    async addFavouriteFaction(input: { userId: string; catalogueId: string; now: number }) {
      await this.call('add_favourite_faction', [input.userId, input.catalogueId, input.now])
    }

    async removeFavouriteFaction(userId: string, catalogueId: string) {
      await this.call('remove_favourite_faction', [userId, catalogueId])
    }

    async favouriteDetachmentsByUser(userId: string) {
      return this.read('favourite_detachments_by_user', [userId], z.array(favouriteDetachmentRow))
    }

    async addFavouriteDetachment(input: { userId: string; catalogueId: string; detachmentId: string; now: number }) {
      await this.call('add_favourite_detachment', [input.userId, input.catalogueId, input.detachmentId, input.now])
    }

    async removeFavouriteDetachment(userId: string, catalogueId: string, detachmentId: string) {
      await this.call('remove_favourite_detachment', [userId, catalogueId, detachmentId])
    }

    async favouriteDatasheetsByUser(userId: string) {
      return this.read('favourite_datasheets_by_user', [userId], z.array(favouriteDatasheetRow))
    }

    async addFavouriteDatasheet(input: { userId: string; entryId: string; now: number }) {
      await this.call('add_favourite_datasheet', [input.userId, input.entryId, input.now])
    }

    async removeFavouriteDatasheet(userId: string, entryId: string) {
      await this.call('remove_favourite_datasheet', [userId, entryId])
    }

    async unitLoadoutsByUser(userId: string) {
      return this.read('unit_loadouts_by_user', [userId], z.array(unitLoadoutRow))
    }

    async saveUnitLoadout(id: string, userId: string, loadout: UnitLoadout, now: number) {
      return this.reply('save_unit_loadout', [id, userId, JSON.stringify(loadout), now], z.enum(['saved', 'full', 'refused']))
    }

    async renameUnitLoadout(id: string, userId: string, name: string) {
      return this.reply('rename_unit_loadout', [id, userId, name], z.boolean())
    }

    async deleteUnitLoadout(id: string, userId: string) {
      return this.reply('delete_unit_loadout', [id, userId], z.boolean())
    }

    async recentMatchupsByUser(userId: string) {
      return this.read('recent_matchups_by_user', [userId], z.array(recentMatchupRow))
    }

    async rememberMatchup(input: RecentMatchup & { userId: string; pairing: string; now: number }) {
      await this.call('remember_matchup', [input.userId, input.pairing, input.shared, input.attacker, input.defender, input.now])
    }

    async forgetMatchup(userId: string, pairing: string) {
      await this.call('forget_matchup', [userId, pairing])
    }

    async abilityRemindersByUser(userId: string) {
      return this.read('ability_reminders_by_user', [userId], z.array(abilityReminderSchema))
    }

    async saveAbilityReminder(userId: string, reminder: AbilityReminder, now: number) {
      return this.read('save_ability_reminder', [userId, JSON.stringify(reminder), now], z.enum(['saved', 'full']))
    }

    async deleteAbilityReminder(userId: string, key: string) {
      await this.call('delete_ability_reminder', [userId, key])
    }

    async listFilterPreferences(userId: string) {
      return this.read('list_filter_preferences', [userId], z.record(z.string(), listPreferencesSchema))
    }

    async setListFilterPreferences(userId: string, scope: ListFilterScope, preferences: ListPreferences, now: number) {
      return this.read('set_list_filter_preferences', [userId, scope, JSON.stringify(preferences), now], z.boolean())
    }

    async playerDefaults(userId: string) {
      return this.read('player_defaults', [userId], playerDefaultsSchema)
    }

    async setPlayerDefaults(userId: string, defaults: PlayerDefaults, now: number) {
      return this.read('set_player_defaults', [userId, defaults.rosterVisibility, defaults.battleSize, now], playerDefaultsSchema)
    }

    async calendarFeedByUser(userId: string) {
      return this.read('calendar_feed_by_user', [userId], z.string().nullable())
    }

    async replaceCalendarFeed(userId: string, token: string, now: number) {
      await this.call('replace_calendar_feed', [userId, token, now])
    }

    async removeCalendarFeed(userId: string) {
      return this.reply('remove_calendar_feed', [userId], z.boolean())
    }

    async calendarFeed(token: string) {
      return this.read('calendar_feed', [token], calendarFeedDates.nullable())
    }
  }
}
