import { z } from 'zod'
import * as forms from '../contracts/schemas'
import { swissRound, tournamentNoShowIds } from '../core/sealedEvent'
import { rosterFolderChangeSchema } from '../core/rosterFolders'
import { battleInvitePath } from '../core/notifications'
import { read, write } from './accountToolDefinition'
import { app } from './app'
import { battlebaseCode } from './battlebase'
import { importBattlebaseHistory, linkedBattlebaseAccount } from './battlebaseAccountImport'
import { captureMutation, checkInSealedEventEntrant, inviteFriendToBattle } from './mutationTelemetry'
import { productActions } from './productActions'
import { reopenTournamentTable, tournamentBattlefieldRules } from './tournamentTableActions'

const publicChange = { destructive: true, public: true }
const empty = z.object({})
const battleUrl = (token: string) => `/battles/${encodeURIComponent(token)}`

const dropNoShowsInput = forms.dropNoShowsSchema.extend({
  expectedUserIds: forms.addSealedEventEntrantsSchema.shape.userIds.describe('Exactly the organizer’s noShowIds from get_my_event.'),
})

const swapSeatsInput = forms.swapTableSeatsSchema.extend({
  round: forms.tableBattlefieldsSchema.shape.round.min(1).describe('The current Swiss round from get_my_event.'),
  tables: z
    .tuple([forms.tableBattlefieldsSchema.shape.table.min(1), forms.tableBattlefieldsSchema.shape.table.min(1)])
    .describe('The table numbers of the two players, in the same order as players.'),
})

export const workflowAccountTools = {
  list_my_battle_drafts: read(
    'List my battle drafts',
    'Finds unfinished setups the signed-in player has created or joined. Use a draft token with get_my_battle and submit_battle_action to resume it.',
    empty,
    async (owner) => {
      const drafts = await app().service.drafts(owner)
      return {
        drafts: drafts.map(({ token, playerDetails, settings }) => ({
          token,
          url: battleUrl(token),
          size: settings.limit,
          missionPackId: settings.missionPackId,
          players: playerDetails.map(({ name }) => name),
        })),
      }
    },
  ),
  invite_friend_to_battle: write(
    'Send a battle invite to a friend',
    'Sends an in-app notification and returns the join link. Use the draft token from list_my_battle_drafts and the friend id from list_my_opponents. Confirm the recipient first.',
    forms.inviteToBattleSchema,
    async (owner, { token, friendId }) => {
      const { invite } = await inviteFriendToBattle(owner, token, friendId)
      return { joinUrl: battleInvitePath(invite) }
    },
    publicChange,
    async (owner, input) => {
      const { token, friendId } = forms.inviteToBattleSchema.parse(input)
      const instance = app()
      const [opponents, { screen }] = await Promise.all([
        instance.service.socialService.opponents(owner),
        instance.service.seatedBattle(token, owner),
      ])
      const friend = opponents.find(({ id }) => id === friendId)
      if (!friend) throw new Response('Friend not found.', { status: 404 })
      return `Send ${friend.name} an in-app invite to ${screen.view.players.map(({ name }) => name).join(' vs ')}.`
    },
  ),
  check_in_tournament_entrant: write(
    'Check in a tournament entrant',
    'An organizer marks an entrant from get_my_event as present or undoes their check-in before the first round is paired.',
    forms.checkInSchema,
    async (owner, { token, eventToken, userId, checkedIn }) => {
      await checkInSealedEventEntrant(owner, token, eventToken ?? token, userId, checkedIn)
      return { checkedIn }
    },
    publicChange,
  ),
  drop_tournament_no_shows: write(
    'Drop tournament no-shows',
    'Drops sealed entrants who have not checked in at a revealed solo Swiss tournament before the first round. If get_my_event returns a nonempty noShowIds list, confirm those players with the organizer before calling.',
    dropNoShowsInput,
    async (owner, { token, eventToken, expectedUserIds }) => {
      await app().service.sealedEventService.dropNoShows(token, eventToken ?? token, owner, expectedUserIds)
      captureMutation(owner, 'sealed_event_no_shows_dropped', {})
    },
    publicChange,
    async (owner, input) => {
      const { token, eventToken, expectedUserIds } = dropNoShowsInput.parse(input)
      const event = await app().service.sealedEventService.sealedEvent(token, owner, eventToken)
      if (!event?.organizer) throw new Response('Only the tournament organizer can drop no-shows.', { status: 403 })
      const noShows = tournamentNoShowIds(event.entries)
      const expected = expectedUserIds.toSorted()
      if (noShows.length !== expected.length || noShows.some((id, index) => id !== expected[index]))
        throw new Response('The no-show list changed. Read get_my_event again.', { status: 409 })
      const names = event.entries.filter(({ userId }) => noShows.includes(userId)).map(({ name }) => name)
      return `Drop ${names.join(', ')} for missing check-in at ${event.tournament?.name ?? 'this tournament'}.`
    },
  ),
  swap_tournament_table_seats: write(
    'Swap players between tournament tables',
    'An organizer swaps two entrants in the current Swiss round. Use the round, table numbers and ordered player ids from get_my_event. Confirm the affected tables before calling.',
    swapSeatsInput,
    async (owner, { token, eventToken, players, round, tables }) => {
      await app().service.sealedEventService.swapSeats(token, eventToken ?? token, owner, players, { round, tables })
      captureMutation(owner, 'sealed_event_seats_swapped', {})
    },
    publicChange,
    async (owner, input) => {
      const { token, eventToken, players, round, tables } = swapSeatsInput.parse(input)
      const event = await app().service.sealedEventService.sealedEvent(token, owner, eventToken)
      if (!event?.organizer) throw new Response('Only the tournament organizer can swap seats.', { status: 403 })
      if (round !== swissRound(event) || tables[0] === tables[1])
        throw new Response('The tables changed. Read get_my_event again.', { status: 409 })
      const seats = players.map((id, index) => {
        const player = event.entries.find(({ userId }) => userId === id)
        const pairing = event.pairings.find(({ round: at, table }) => at === round && table === tables[index])
        if (!player || (pairing?.aId !== id && pairing?.bId !== id))
          throw new Response('The tables changed. Read get_my_event again.', { status: 409 })
        return `${player.name} at table ${tables[index]}`
      })
      return `Swap ${seats.join(' with ')} in round ${round} of ${event.tournament?.name ?? 'this tournament'}.`
    },
  ),
  list_tournament_table_battlefields: read(
    'List battlefields for a tournament table',
    'Lists the allowed deployments and terrain layouts after the table’s rosters are revealed. Use the event token, round and table from get_my_event.',
    forms.tableBattlefieldsSchema,
    async (owner, { token, eventToken, round, table, missionPackId }) => {
      const instance = app()
      const event = await instance.service.sealedEventService.sealedEvent(token, owner, eventToken)
      if (!event) throw new Response('Tournament or hidden-list game not found.', { status: 404 })
      const { options } = await instance.service.sealedEventService.tableBattlefields(
        token,
        eventToken,
        round,
        table,
        missionPackId,
        await tournamentBattlefieldRules(),
      )
      const assigned = event.battlefields.find((field) => field.round === round && field.table === table) ?? null
      return { options, assigned }
    },
  ),
  set_tournament_table_battlefield: write(
    'Assign a battlefield to a tournament table',
    'An organizer chooses a layout from list_tournament_table_battlefields. Use roll to draw an allowed layout or null to let the players choose.',
    forms.setTableBattlefieldSchema,
    async (owner, { token, eventToken, round, table, missionPackId, battlefield }) => {
      const assigned = await app().service.sealedEventService.setTableBattlefield(
        token,
        eventToken ?? token,
        owner,
        round,
        table,
        missionPackId,
        battlefield,
        await tournamentBattlefieldRules(),
      )
      captureMutation(owner, 'sealed_event_battlefield_set', { rolled: battlefield === 'roll', cleared: battlefield === null })
      return { assigned }
    },
    publicChange,
  ),
  reopen_tournament_table: write(
    'Reopen a finished tournament table',
    'An organizer reopens a finished Swiss battle for score corrections, even if a later round has locked it. Use get_my_event with tableRound to find the battle token, then confirm the table.',
    forms.reopenSwissTableSchema,
    async (owner, data) => {
      await reopenTournamentTable(owner, data)
      return { token: data.battleToken, url: battleUrl(data.battleToken) }
    },
    publicChange,
  ),
  get_my_collection_wishlist: read(
    'Read my model wishlist',
    'Returns the models the player wants, with the datasheet id, name and wanted count. Includes models the player does not yet own.',
    empty,
    async (owner) => {
      const instance = app()
      const [wishes, factions] = await Promise.all([instance.service.rosterService.collectionWishes(owner), instance.combatUnitsFor()])
      const names = new Map(factions.flatMap(({ units }) => units.map(({ id, name }) => [id, name] as const)))
      return {
        wishlist: Object.entries(wishes).map(([id, wanted]) => ({ id, name: names.get(id) ?? 'A datasheet from earlier rules', wanted })),
      }
    },
  ),
  import_collection: write(
    'Import multiple collection entries',
    'Saves collection counts in one operation. Match every row to a datasheet id with list_units. Use replace false to keep existing counts. Use true only after explicit confirmation to overwrite counts on matching entries. Entries omitted from the import stay in the collection, so imports can be split into batches.',
    forms.collectionImportSchema,
    async (owner, { rows, replace }) => {
      const result = await app().service.rosterService.importCollection(owner, rows, replace)
      captureMutation(owner, 'player_collection_imported', { rows: rows.length, replace, ...result })
      return result
    },
    publicChange,
    (_owner, input) => {
      const { rows, replace } = forms.collectionImportSchema.parse(input)
      return replace
        ? `Import ${rows.length} entries and overwrite matching collection counts.`
        : `Import ${rows.length} entries into your collection.`
    },
  ),
  change_rosters_in_bulk: write(
    'Apply an action to multiple rosters',
    'Archives, restores, locks, unlocks, changes visibility or deletes a named set of owned rosters in one operation. Confirm each roster and the exact action, especially deletion or publishing.',
    forms.rosterBatchSchema,
    async (owner, { ids, action }) => {
      const changed = await app().service.rosterService.changeRosters(owner, ids, action)
      captureMutation(owner, 'rosters_changed', { action, count: ids.length })
      return { action, changed }
    },
    publicChange,
    async (owner, input) => {
      const { ids, action } = forms.rosterBatchSchema.parse(input)
      const summaries = await app().service.rosterService.savedRosterSummaries(owner)
      const names = ids.map((id) => summaries.find((roster) => roster.id === id)?.name ?? id)
      return `Apply ${action} to ${names.map((name) => `“${name}”`).join(', ')}.`
    },
  ),
  list_roster_folders: read(
    'List my roster folders',
    'Returns folder ids, names and parents, and the saved roster groups filed in each folder.',
    empty,
    async (owner) => app().repository.rosterFolders(owner),
  ),
  change_roster_folders: write(
    'Organize my roster folders',
    'Adds, renames, moves or removes a folder, or files rosters in one. Use ids from list_roster_folders and list_my_rosters. For add, supply a new UUID and reuse it if retrying. Use parentId null for the top level or folderId null to unfile rosters.',
    z.object({ change: rosterFolderChangeSchema }),
    async (owner, { change }) => productActions.changeRosterFolders(owner, change),
    publicChange,
  ),
  list_saved_unit_loadouts: read(
    'List saved unit loadouts',
    'Lists the signed-in player’s saved unit loadouts with their ids, models and choices, including joined units.',
    empty,
    async (owner) => ({ loadouts: await app().service.rosterService.unitLoadouts(owner) }),
  ),
  save_unit_loadout: write(
    'Save a unit loadout',
    'Saves a named unit configuration using datasheet and choice ids from get_unit_options. Use a new UUID for a new configuration. Reusing an id keeps the first saved configuration. Use rename_unit_loadout to change its name.',
    forms.saveUnitLoadoutSchema,
    async (owner, data) => {
      await app().service.rosterService.saveUnitLoadout(owner, data)
      captureMutation(owner, 'unit_loadout_saved')
      return { id: data.id }
    },
    publicChange,
  ),
  rename_unit_loadout: write(
    'Rename a saved unit loadout',
    'Renames a loadout by id from list_saved_unit_loadouts.',
    forms.renameUnitLoadoutSchema,
    async (owner, { id, name }) => {
      await app().service.rosterService.renameUnitLoadout(owner, id, name)
      captureMutation(owner, 'unit_loadout_renamed')
      return { id, name }
    },
    publicChange,
  ),
  delete_unit_loadout: write(
    'Delete a saved unit loadout',
    'Deletes a loadout by id from list_saved_unit_loadouts. Confirm its name before deleting.',
    forms.unitLoadoutIdSchema,
    async (owner, { id }) => {
      await app().service.rosterService.deleteUnitLoadout(owner, id)
      captureMutation(owner, 'unit_loadout_deleted')
    },
    publicChange,
  ),
  get_linked_battlebase_account: read(
    'Read my linked BattleBase account',
    'Returns the BattleBase username previously verified by this player, or null.',
    empty,
    async (owner) => ({ username: (await linkedBattlebaseAccount(owner))?.name ?? null }),
  ),
  get_battlebase_link_code: read(
    'Get a BattleBase account verification code',
    'Returns the code the player must put in their BattleBase profile tagline before importing games for this username. The player updates the tagline on BattleBase.',
    forms.battlebaseUsernameSchema,
    async (owner, { username }) => ({ code: battlebaseCode(owner, username) }),
  ),
  import_battlebase_history: write(
    'Import finished games from BattleBase',
    'Imports up to 20 public games at a time from a verified BattleBase account, skipping unfinished or already imported games. Use a username when linking a new account after the player adds their verification code to their tagline. Confirm the import first, then repeat with nextCursor as before until nextCursor is null. Retrying the same page is safe.',
    forms.battlebaseImportSchema.extend({
      before: z.string().min(1).max(128).optional().describe('The nextCursor from an earlier import call. Omit on the first call.'),
    }),
    async (owner, { username, before }) => {
      if (!username && !(await linkedBattlebaseAccount(owner)))
        throw new Response('Name a BattleBase username to link, and first add its verification code to the tagline.', { status: 400 })
      const result = await importBattlebaseHistory(owner, username, { before })
      return result.outcome === 'imported'
        ? {
            outcome: result.outcome,
            username: result.username,
            counts: await result.counts,
            linkedSeats: result.linkedSeats,
            nextCursor: result.nextCursor,
          }
        : { outcome: result.outcome }
    },
    publicChange,
  ),
}
