import { z } from 'zod'
import * as forms from '../contracts/schemas'
import type { AgentTools } from './agentTools'
import { read, write } from './accountToolDefinition'
import { app } from './app'
import { captureMutation, joinInvitedBattle, removePlayerFromBattle, shareBattleLink, stopSharingBattleLink } from './mutationTelemetry'
import { productActions, publishGroupLeague } from './productActions'
import { leagueFixtureUnfinished } from '../core/groupLeague'
import { battleInvitePath } from '../core/notifications'
import { workflowAccountTools } from './workflowAccountTools'

const battlePath = (token: string) => `/battles/${encodeURIComponent(token)}`
const groupPath = (token: string) => `/groups/${encodeURIComponent(token)}`
const tournamentPath = (token: string) => `/tournaments/${encodeURIComponent(token)}`
const publicAdd = { destructive: false, public: true }
const publicChange = { destructive: true, public: true }
const inviteInput = forms.battleInviteSchema.extend({
  invite: forms.battleInviteSchema.shape.invite.describe('The invite token in the last path segment of the Praetorium join link.'),
})

const tournamentResultInput = forms.reportTableResultSchema.extend({
  expectedPlayers: forms.swapTableSeatsSchema.shape.players.describe('The two player IDs in seat order from get_my_event.'),
})

async function eventForApproval(owner: string, input: { token: string; eventToken?: string }) {
  const event = await app().service.sealedEventService.sealedEvent(input.token, owner, input.eventToken)
  if (!event) throw new Response('Tournament or hidden-list game not found.', { status: 404 })
  return event
}

function entrantName(event: Awaited<ReturnType<typeof eventForApproval>>, id: string) {
  const entrant = event.entries.find(({ userId }) => userId === id)
  if (!entrant) throw new Response('Entrant not found.', { status: 404 })
  return entrant.name
}

const tools = {
  ...workflowAccountTools,
  get_battle_invite: read(
    'Read a battle invite',
    'Shows who is at the table, the open places on each side and whether the battle has begun. Side indexes start at 0. Use before join_battle.',
    inviteInput,
    async (owner, { invite }) => {
      const result = await app().service.battleInvitation(invite, owner)
      if (!result) throw new Response('This link no longer joins a battle.', { status: 404 })
      return {
        ...result,
        url: result.token ? battlePath(result.token) : null,
        sides: result.sides.map((side) => side.map(({ name, army }) => ({ name, army }))),
      }
    },
  ),
  join_battle: write(
    'Join a battle from an invite',
    'Takes an open place on side 0 or 1 from get_battle_invite. Confirm the host and side with the player before joining.',
    forms.joinBattleSchema.extend(inviteInput.shape),
    async (owner, { invite, side }) => {
      const { token } = await joinInvitedBattle(owner, invite, side)
      return { token, url: battlePath(token) }
    },
    publicAdd,
    async (owner, input) => {
      const { invite, side } = forms.joinBattleSchema.parse(input)
      const battle = await app().service.battleInvitation(invite, owner)
      if (!battle) throw new Response('This link no longer joins a battle.', { status: 404 })
      return `Join ${battle.hostName ?? 'the host'}’s battle on side ${side + 1}.`
    },
  ),
  share_battle_invite: write(
    'Create a battle join link',
    'Creates or returns the join link for a battle the player can share. Anyone who has the link can use it to take an open place.',
    forms.tokenSchema,
    async (owner, { token }) => {
      const { invite } = await shareBattleLink(owner, token)
      return { joinUrl: battleInvitePath(invite) }
    },
    publicAdd,
  ),
  stop_sharing_battle_invite: write(
    'Retire a battle join link',
    'Disables a battle’s existing join link. People already seated keep their places.',
    forms.tokenSchema,
    async (owner, { token }) => {
      await stopSharingBattleLink(owner, token)
    },
    publicChange,
  ),
  play_both_battle_sides: write(
    'Play both sides of a battle',
    'Fills the open places in a draft with practice seats the signed-in player can control. Use create_battle with bothSides when starting a fresh draft.',
    forms.tokenSchema,
    async (owner, { token }) => {
      await app().service.playBothSides(token, owner)
    },
    publicChange,
  ),
  remove_battle_player: write(
    'Remove a player from a battle draft',
    'The creator removes a named player from a draft that has not started. This retires the current join link. Confirm the player and battle.',
    forms.removeBattlePlayerSchema,
    async (owner, { token, playerId }) => {
      await removePlayerFromBattle(owner, token, playerId)
    },
    publicChange,
    async (owner, input) => {
      const { token, playerId } = forms.removeBattlePlayerSchema.parse(input)
      const { screen } = await app().service.seatedBattle(token, owner)
      const player = screen.view.players.find(({ id }) => id === playerId)
      if (!player) throw new Response('That player is not seated in this battle.', { status: 404 })
      return `Remove ${player.name} from ${screen.view.players.map(({ name }) => name).join(' vs ')} and retire its join link.`
    },
  ),
  set_collection_models: write(
    'Set owned model count',
    'Sets the total number of models owned for a datasheet. Use its id from list_units or get_my_collection. Confirm the unit and count with the player.',
    forms.collectionModelsSchema,
    async (owner, data) => {
      await productActions.setCollectionModels(owner, data)
    },
    publicChange,
  ),
  set_collection_progress: write(
    'Set built and painted model counts',
    'Sets a datasheet’s built and painted totals. Read get_my_collection first and use the datasheet id it returns.',
    forms.collectionProgressSchema,
    async (owner, data) => {
      await productActions.setCollectionProgress(owner, data)
    },
    publicChange,
  ),
  set_collection_counts_as: write(
    'Set what a model collection entry counts as',
    'Replaces the alternative datasheets a unit’s models can be fielded as. Use datasheet ids from list_units. An empty list clears the alternatives.',
    forms.collectionCountsAsSchema,
    async (owner, data) => {
      await productActions.setCollectionCountsAs(owner, data)
    },
    publicChange,
  ),
  set_collection_wanted: write(
    'Set a wishlist model count',
    'Sets how many more models the player wants for a datasheet. Use its id from list_units; zero clears it.',
    forms.collectionWantedSchema,
    async (owner, data) => {
      await productActions.setCollectionWanted(owner, data)
    },
    publicChange,
  ),
  get_roster_loans: read(
    'Read loans of a saved roster',
    'Lists who holds a loan of the signed-in player’s own roster, by roster id from list_my_rosters.',
    forms.rosterIdSchema,
    async (owner, { id }) => ({ loans: await app().service.rosterService.rosterLoans(owner, id) }),
  ),
  list_borrowed_rosters: read(
    'List rosters friends lent you',
    'Lists rosters the signed-in player has borrowed from friends. Use a borrowed roster’s id to field or seal it where the site allows.',
    z.object({}),
    async (owner) => ({
      rosters: (await app().service.rosterService.rostersLentTo(owner)).map(({ summary, owner: lender }) => ({
        id: summary.id,
        name: summary.name,
        lender,
        url: `/rosters/${encodeURIComponent(summary.id)}`,
      })),
    }),
  ),
  lend_roster: write(
    'Lend a roster to a friend',
    'Lets a friend use an owned roster. Get the roster id from list_my_rosters and the borrower id from list_my_opponents. Confirm the roster and recipient.',
    forms.rosterLoanSchema,
    async (owner, { id, borrowerId }) => {
      await app().service.rosterService.lendRoster(owner, id, borrowerId)
      captureMutation(owner, 'roster_lent')
    },
    publicAdd,
    async (owner, input) => {
      const { id, borrowerId } = forms.rosterLoanSchema.parse(input)
      const instance = app()
      const [roster, opponents] = await Promise.all([
        instance.service.sealedEventService.ownRoster(owner, id),
        instance.service.socialService.opponents(owner),
      ])
      const friend = opponents.find((opponent) => opponent.id === borrowerId)
      if (!roster || !friend) throw new Response('Roster or friend not found.', { status: 404 })
      return `Lend “${roster.name}” to ${friend.name}.`
    },
  ),
  end_roster_loan: write(
    'End a roster loan',
    'Revokes a loan if the player owns the roster, or returns it if the player is the borrower. Confirm who loses access before calling.',
    forms.rosterLoanSchema,
    async (owner, { id, borrowerId }) => {
      await app().service.rosterService.endRosterLoan(owner, id, borrowerId)
      captureMutation(owner, 'roster_loan_ended', { by: owner === borrowerId ? 'borrower' : 'owner' })
    },
    publicChange,
  ),
  set_roster_locked: write(
    'Lock or unlock a roster',
    'Changes the saved roster’s edit lock. This does not change its army or visibility.',
    forms.rosterLockSchema,
    async (owner, { id, locked }) => {
      await app().service.rosterService.setRosterLocked(owner, id, locked)
      captureMutation(owner, 'roster_lock_updated', { locked })
      return { id, locked }
    },
    publicAdd,
  ),
  split_roster_variant: write(
    'Separate a roster variant',
    'Makes a saved variant a standalone roster without changing its army.',
    forms.rosterSplitSchema,
    async (owner, { id }) => {
      await app().service.rosterService.splitRosterVariant(owner, id)
      captureMutation(owner, 'roster_variant_split')
    },
    publicChange,
  ),
  create_group: write(
    'Create a group',
    'Creates a group with the specified name, listing visibility and admission policy. Confirm those choices before creating it.',
    forms.createGroupSchema,
    async (owner, data) => {
      const { token } = await app().service.groupService.createGroup(owner, data)
      captureMutation(owner, 'group_created', { visibility: data.visibility, admission: data.admission })
      return { token, url: groupPath(token) }
    },
    publicAdd,
  ),
  update_group: write(
    'Update group details',
    'An organizer replaces the group name, description, visibility and admission policy. Read get_my_group first and keep any fields the player did not ask to change.',
    forms.updateGroupSchema,
    async (owner, { token, ...details }) => {
      await app().service.groupService.updateGroup(token, owner, details)
      captureMutation(owner, 'group_updated', { visibility: details.visibility, admission: details.admission })
    },
    publicChange,
  ),
  leave_group: write(
    'Leave a group',
    'Removes the signed-in player’s own group membership. Confirm the group before calling.',
    forms.tokenSchema,
    async (owner, { token }) => {
      await app().service.groupService.leaveGroup(token, owner)
      captureMutation(owner, 'group_left')
    },
    publicChange,
  ),
  moderate_group_member: write(
    'Approve or decline a group request',
    'A group organizer accepts or declines a membership request. Use the pending member’s id from get_my_group.',
    forms.moderateGroupMemberSchema,
    async (owner, { token, userId, accept }) => {
      const result = await app().service.groupService.moderateGroupMember(token, owner, userId, accept)
      captureMutation(owner, 'group_member_moderated', { result })
      return { result }
    },
    publicChange,
  ),
  remove_group_member: write(
    'Remove a group member',
    'An organizer removes a named member from a group. This also removes their entry from hidden-list games still sealing.',
    forms.groupMemberSchema,
    async (owner, { token, userId }) => {
      await app().service.groupService.removeGroupMember(token, owner, userId)
      captureMutation(owner, 'group_member_removed')
    },
    publicChange,
  ),
  get_league_fixtures: read(
    'Read a league round’s fixtures',
    'Lists the pairings, fixture keys and results in one round of a group’s league. The first open round is the default. Only organizers can read a draft draw.',
    forms.tokenSchema.extend({ round: forms.groupLeagueDeadlineSchema.shape.round.optional() }),
    async (owner, { token, round }) => {
      const league = await app().service.groupResultsService.groupLeague(token, owner)
      if (!league || (!league.published && !league.organizer)) throw new Response('No league draw is available.', { status: 404 })
      const selectedRound =
        round ?? league.fixtures.find(({ status }) => leagueFixtureUnfinished(status))?.round ?? league.fixtures[0]?.round ?? null
      const names = new Map(league.players.map(({ userId, name }) => [userId, name]))
      return {
        round: selectedRound,
        published: league.published,
        rounds: [...new Set(league.fixtures.map((fixture) => fixture.round))],
        fixtures: league.fixtures
          .filter((fixture) => fixture.round === selectedRound)
          .map(({ key, table, aId, bId, status, battle }) => ({
            key,
            table,
            status,
            players: [aId, bId].map((id) => (id === null ? null : { id, name: names.get(id) ?? null })),
            battle: battle && { url: battlePath(battle.token), status: battle.status, scores: battle.scores },
          })),
      }
    },
  ),
  draw_league: write(
    'Start a league draft',
    'A group organizer starts a round-robin league draft. Read the draft fixtures with get_my_group before publishing.',
    forms.tokenSchema,
    async (owner, { token }) => {
      await app().service.groupService.drawLeague(token, owner)
      captureMutation(owner, 'group_league_drawn')
    },
    publicAdd,
  ),
  start_sealed_league: write(
    'Start a league with sealed lists',
    'A group organizer starts a league in which players seal rosters before the draw is published.',
    forms.startSealedGroupLeagueSchema,
    async (owner, { token, ...rule }) => {
      await app().service.sealedEventService.startSealedLeague(owner, { groupToken: token, ...rule })
      captureMutation(owner, 'group_league_drawn', { sealed_lists: true, roster_limit: rule.rosterLimit })
    },
    publicAdd,
  ),
  publish_league: write(
    'Publish a league draw',
    'A group organizer publishes the reviewed draw. Use the seed and ordered playerIds from get_my_group. Confirm the fixtures before publishing.',
    forms.publishGroupLeagueSchema,
    publishGroupLeague,
    publicChange,
  ),
  set_league_deadline: write(
    'Set a league round deadline',
    'A group organizer sets the deadline for one league round. Give milliseconds since the Unix epoch, or null to clear it.',
    forms.groupLeagueDeadlineSchema,
    async (owner, { token, round, deadline }) => {
      await app().service.groupService.setLeagueDeadline(token, owner, round, deadline)
      captureMutation(owner, 'group_league_deadline_set', { round, cleared: deadline === null })
    },
    publicChange,
  ),
  set_league_clock: write(
    'Set the league chess clock',
    'A group organizer sets the chess-clock minutes for league games that have not started, or null to clear the limit.',
    forms.groupLeagueClockSchema,
    async (owner, { token, minutes }) => {
      await app().service.groupService.setLeagueClock(token, owner, minutes)
      captureMutation(owner, 'group_league_clock_set', { minutes })
    },
    publicChange,
  ),
  leave_league: write(
    'Withdraw from a league',
    'Withdraws the signed-in player from the group’s current league. Confirm before withdrawing.',
    forms.tokenSchema,
    async (owner, { token }) => {
      await app().service.groupService.leaveLeague(token, owner)
      captureMutation(owner, 'group_league_left')
    },
    publicChange,
  ),
  report_league_result: write(
    'Report a league result',
    'A group organizer records a score for a game played outside Praetorium. Use the fixture key and scores in the exact seat order shown by get_league_fixtures. Confirm both player names and final scores.',
    forms.reportFixtureResultSchema,
    async (owner, { token, fixture, vp, missionPackId }) => {
      await app().service.reportFixtureResult(token, fixture, vp, missionPackId, owner)
      captureMutation(owner, 'group_league_result_reported', {})
    },
    publicChange,
    async (owner, input) => {
      const { token, fixture, vp } = forms.reportFixtureResultSchema.parse(input)
      const league = await app().service.groupResultsService.groupLeague(token, owner)
      const table = league?.fixtures.find(({ key }) => key === fixture)
      if (!league?.organizer || !table?.bId) throw new Response('League fixture not found or you do not organize it.', { status: 404 })
      const name = (id: string) => league.players.find((player) => player.userId === id)?.name ?? id
      return `Report ${name(table.aId)} ${vp[0]}–${vp[1]} ${name(table.bId)} in league round ${table.round}.`
    },
  ),
  create_tournament: write(
    'Create a tournament',
    'Creates a tournament using the chosen format, roster limits, listing, admission and schedule. Confirm those choices with the organizer.',
    forms.createSealedEventSchema,
    async (owner, data) => {
      const { token } = await productActions.createSealedEvent(owner, data)
      return { token, url: tournamentPath(token) }
    },
    publicAdd,
  ),
  create_hidden_list_game: write(
    'Create a hidden-list game',
    'A group organizer starts a game where players seal their lists before the reveal. Use the group’s token and confirm the format and points.',
    forms.createHiddenListGameSchema,
    async (owner, data) => {
      const { token } = await app().service.sealedEventService.createHiddenListGame(owner, data)
      captureMutation(owner, 'hidden_list_game_created', { format: data.format, roster_limit: data.rosterLimit })
      return { token, url: `${groupPath(data.groupToken)}/games/${encodeURIComponent(token)}` }
    },
    publicAdd,
  ),
  update_event: write(
    'Update a tournament or hidden-list game',
    'An organizer changes settings or schedule. Read get_my_event first. If changing tournament details, send the name, description, visibility, admission and player limit together.',
    forms.updateSealedEventSchema,
    (owner, data) => productActions.updateSealedEvent(owner, data),
    publicChange,
  ),
  add_event_entrants: write(
    'Add players to a tournament',
    'A tournament organizer adds the selected Praetorium players by id. Confirm the player names and tournament before calling.',
    forms.addSealedEventEntrantsSchema,
    async (owner, data) => {
      const { added } = await productActions.addSealedEventEntrants(owner, data)
      return { added }
    },
    publicAdd,
  ),
  admit_event_entrants: write(
    'Admit tournament entrants',
    'A tournament organizer accepts entrant requests for the listed player ids from get_my_event.',
    forms.admitSealedEventEntriesSchema,
    (owner, data) => productActions.admitSealedEventEntries(owner, data),
    publicChange,
  ),
  moderate_event_entrant: write(
    'Approve or decline a tournament entrant',
    'A tournament organizer accepts or rejects one entrant by id from get_my_event.',
    forms.moderateSealedEventEntrySchema,
    (owner, data) => productActions.moderateSealedEventEntry(owner, data),
    publicChange,
  ),
  choose_hidden_list_side: write(
    'Choose a side in a hidden-list game',
    'Chooses the signed-in player’s seat in a hidden-list game before the reveal. Null steps out of the game.',
    forms.chooseSealedEventSideSchema,
    (owner, data) => productActions.chooseSealedEventSide(owner, data),
    publicChange,
  ),
  set_event_team_disposition: write(
    'Set a sealed team’s Force Disposition',
    'Chooses a Force Disposition the allied sealed lists offer before reveal. Use the Force Disposition id from the rules reference.',
    forms.setSealedEventTeamDispositionSchema,
    (owner, data) => productActions.setSealedEventTeamDisposition(owner, data),
    publicChange,
  ),
  set_event_team_warlord: write(
    'Choose which allied Warlord leads',
    'Sets whose Warlord leads a side made from allied sealed lists. Use a teammate’s entrant id from get_my_event.',
    forms.setSealedEventTeamWarlordSchema,
    (owner, data) => productActions.setSealedEventTeamWarlord(owner, data),
    publicChange,
  ),
  assign_event_team: write(
    'Assign an event team',
    'An organizer forms an allied side from two entrants, or sends one entrant id to separate them. Confirm all affected players before changing seats.',
    forms.assignSealedEventTeamSchema,
    (owner, data) => productActions.assignSealedEventTeam(owner, data),
    publicChange,
    async (owner, input) => {
      const data = forms.assignSealedEventTeamSchema.parse(input)
      const event = await eventForApproval(owner, data)
      const entrants = data.userIds.map((id) => entrantName(event, id))
      const name = event.tournament?.name ?? 'this hidden-list game'
      return entrants.length === 1 ? `Separate ${entrants[0]} from their ally in ${name}.` : `Team up ${entrants.join(' and ')} in ${name}.`
    },
  ),
  unseal_event_roster: write(
    'Unseal an entrant’s roster',
    'Clears the named entrant’s sealed roster so they can seal again, where their role and the event state allow it. Confirm before calling.',
    forms.sealedEventRosterSchema,
    (owner, data) => productActions.unsealSealedEventRoster(owner, data),
    publicChange,
    async (owner, input) => {
      const data = forms.sealedEventRosterSchema.parse(input)
      const event = await eventForApproval(owner, data)
      return `Unseal ${entrantName(event, data.userId)}’s roster in ${event.tournament?.name ?? 'this hidden-list game'}.`
    },
  ),
  reveal_event_rosters: write(
    'Reveal sealed rosters',
    'Irreversibly reveals sealed rosters in a tournament or hidden-list game, where the signed-in player has permission. Ask for explicit confirmation to reveal now.',
    forms.sealedEventSchema,
    (owner, data) => productActions.revealSealedEvent(owner, data),
    publicChange,
    async (owner, input) => {
      const event = await eventForApproval(owner, forms.sealedEventSchema.parse(input))
      return `Reveal all sealed rosters for ${event.tournament?.name ?? 'this hidden-list game'}. This cannot be undone.`
    },
  ),
  pair_tournament_round: write(
    'Pair the next tournament round',
    'A tournament organizer pairs the next Swiss round once each table from the previous round is finished. Confirm before publishing pairings.',
    forms.pairSealedEventRoundSchema,
    async (owner, { token, eventToken }) => {
      const result = await app().service.sealedEventResultsService.pairSealedEventRound(token, eventToken, owner)
      captureMutation(owner, 'sealed_event_round_paired', { round: result.round })
      return { round: result.round }
    },
    publicChange,
    async (owner, input) => {
      const event = await eventForApproval(owner, forms.pairSealedEventRoundSchema.parse(input))
      return `Pair and publish the next Swiss round of ${event.tournament?.name ?? 'this tournament'}.`
    },
  ),
  report_tournament_table: write(
    'Report a tournament table score',
    'An organizer reports a score for a tournament table. Obtain the round, table and seat order from get_my_event. Confirm both players and scores, then pass those same player IDs in expectedPlayers. Players at the table can use report_table_result instead.',
    tournamentResultInput,
    async (owner, { token, eventToken, round, table, vp, missionPackId, expectedPlayers }) => {
      await app().service.sealedEventResultsService.reportTableResult(token, eventToken, round, table, vp, missionPackId, owner, {
        expectedPlayers,
        organizerOnly: true,
      })
      captureMutation(owner, 'sealed_event_result_reported', { round })
    },
    publicChange,
    async (owner, input) => {
      const data = tournamentResultInput.parse(input)
      const event = await eventForApproval(owner, data)
      const table = event.pairings.find((pairing) => pairing.round === data.round && pairing.table === data.table)
      if (!event.organizer || !table?.bId) throw new Response('Table not found or you do not organize it.', { status: 404 })
      if (table.aId !== data.expectedPlayers[0] || table.bId !== data.expectedPlayers[1])
        throw new Response('The table’s players changed. Read get_my_event again.', { status: 409 })
      const name = (id: string) => entrantName(event, id)
      return `Report ${name(table.aId)} ${data.vp[0]}–${data.vp[1]} ${name(table.bId)} at table ${data.table}, round ${data.round} of ${event.tournament?.name ?? 'this tournament'}.`
    },
  ),
  set_tournament_round_timer: write(
    'Set the tournament round timer',
    'An organizer starts or stops the current round timer. Send minutes, or null to stop it. Use fromEnd only to add time to an existing deadline.',
    forms.setRoundTimerSchema,
    async (owner, { token, eventToken, minutes, fromEnd }) => {
      await app().service.sealedEventService.setRoundTimer(token, eventToken ?? token, owner, minutes, fromEnd)
      captureMutation(owner, 'sealed_event_round_timer_set', { minutes })
    },
    publicChange,
  ),
  get_event_roster: read(
    'Read an entrant’s sealed roster',
    'Reads a sealed roster the signed-in player may see, by event token and entrant id from get_my_event. The site applies its rules for access before and after reveal.',
    forms.sealedEventRosterSchema,
    async (owner, { token, eventToken, userId }) => {
      const roster = await app().service.sealedEventService.sealedEventRoster(token, userId, eventToken, owner)
      if (!roster) throw new Response('This sealed roster is unavailable to you.', { status: 404 })
      return { roster }
    },
  ),
  withdraw_from_event: write(
    'Withdraw from a tournament',
    'Withdraws the signed-in player from a tournament. The entry and recorded results are kept. Confirm the tournament and withdrawal.',
    forms.sealedEventSchema,
    async (owner, { token, eventToken }) => {
      await app().service.sealedEventService.dropSealedEventEntrant(token, eventToken ?? '', owner, owner)
      captureMutation(owner, 'sealed_event_entrant_dropped', { withdrew: true })
    },
    publicChange,
  ),
  set_tournament_team: write(
    'Create, join or leave a tournament team',
    'For team Swiss, send a name to start a team, a squadId to join a team, or null to leave. Read team ids with get_my_event.',
    forms.setSquadSchema,
    async (owner, { token, eventToken, squad }) => {
      await app().service.sealedEventService.setSquad(token, eventToken ?? token, owner, squad)
      captureMutation(owner, 'sealed_event_team_set', { action: squad === null ? 'leave' : 'name' in squad ? 'create' : 'join' })
    },
    publicChange,
  ),
  pick_tournament_team_players: write(
    'Submit a team pairing pick',
    'In team Swiss, submits the player ids for the current step of a team meeting. Use the round, table and current step from get_my_event. Omit squadId to pick for your own team.',
    forms.pickSquadSchema,
    async (owner, { token, eventToken, ...pick }) => {
      const result = await app().service.sealedEventService.pickSquad({ token, eventToken: eventToken ?? token, ownerId: owner, ...pick })
      captureMutation(owner, 'sealed_event_team_pick', { step: pick.step, revealed: result.revealed })
    },
    publicChange,
  ),
}

const accountTools = new Map(Object.entries(tools))
export const additionalAccountScopes = Object.fromEntries([...accountTools].map(([name, tool]) => [name, tool.scope]))

export function registerAdditionalAccountTools(server: AgentTools, userId: string | null) {
  for (const [name, tool] of accountTools) tool.register(server, name, userId)
}

export function additionalAccountApproval(name: string, owner: string, input: Record<string, unknown>) {
  return accountTools.get(name)?.approval(owner, input)
}
