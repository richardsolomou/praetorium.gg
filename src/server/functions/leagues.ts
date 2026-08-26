import { createServerFn } from '@tanstack/react-start'
import { app } from '../app'
import { currentUserId, requireUser } from '../playerSession'
import { rosterForUse } from '../rosterUsage'
import { mutationRpc, rpc } from '../rpc'
import {
  assignLeagueRosterRequirementSchema,
  assignLeagueTeamSchema,
  createLeagueBattleSchema,
  createLeagueEventSchema,
  createLeagueSchema,
  leagueBattlesSchema,
  leagueEventSchema,
  leagueRosterSchema,
  moderateLeagueEntrySchema,
  openLeagueSchema,
  submitLeagueRosterSchema,
  tokenSchema,
  updateLeagueSchema,
} from '../schemas'

export const listLeagues = createServerFn({ method: 'GET' }).handler(() => rpc(async () => app().service.leagues(await currentUserId())))

export const openLeague = createServerFn({ method: 'GET' })
  .validator(openLeagueSchema)
  .handler(({ data }) => rpc(async () => app().service.league(data.token, await currentUserId(), data.eventToken)))

export const listLeagueBattles = createServerFn({ method: 'GET' })
  .validator(leagueBattlesSchema)
  .handler(({ data }) =>
    rpc(() => app().service.leagueBattles(data.token, data.eventToken, { limit: 25, before: data.before ?? undefined }, app().rules())),
  )

export const createLeague = createServerFn({ method: 'POST' })
  .validator(createLeagueSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      const result = await app().service.createLeague(player.id, data)
      await app().telemetry.capture(player.id, 'league_created', {
        visibility: data.visibility,
        admission: data.admission,
        format: data.format,
        roster_limit: data.rosterLimit,
      })
      return result
    }),
  )

export const joinLeague = createServerFn({ method: 'POST' })
  .validator(leagueEventSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      const status = await app().service.joinLeague(data.token, player.id, data.eventToken)
      await app().telemetry.capture(player.id, 'league_joined', { status })
      return status
    }),
  )

export const moderateLeagueEntry = createServerFn({ method: 'POST' })
  .validator(moderateLeagueEntrySchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      await app().service.moderateLeagueEntry(data.token, player.id, data.userId, data.status, data.eventToken)
      return null
    }),
  )

export const submitLeagueRoster = createServerFn({ method: 'POST' })
  .validator(submitLeagueRosterSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      const { saved, snapshot } = await rosterForUse(player.id, data.rosterId)
      const result = await app().service.submitLeagueRoster(data.token, player.id, saved, snapshot, data.eventToken)
      await app().telemetry.capture(player.id, 'league_roster_submitted', {
        format: result.format,
        required_limit: result.requiredLimit,
      })
      return null
    }),
  )

export const revealLeague = createServerFn({ method: 'POST' })
  .validator(leagueEventSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      await app().service.revealLeague(data.token, player.id, data.eventToken)
      await app().telemetry.capture(player.id, 'league_rosters_revealed')
      return null
    }),
  )

export const openLeagueRoster = createServerFn({ method: 'GET' })
  .validator(leagueRosterSchema)
  .handler(({ data }) => rpc(() => app().service.leagueRoster(data.token, data.userId, data.eventToken)))

export const createLeagueEvent = createServerFn({ method: 'POST' })
  .validator(createLeagueEventSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      const result = await app().service.createLeagueEvent(data.token, player.id, data)
      await app().telemetry.capture(player.id, 'league_event_created', { format: data.format, roster_limit: data.rosterLimit })
      return result
    }),
  )

export const assignLeagueRosterRequirement = createServerFn({ method: 'POST' })
  .validator(assignLeagueRosterRequirementSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      const result = await app().service.assignLeagueRosterRequirement(
        data.token,
        player.id,
        data.userId,
        data.requiredLimit,
        data.eventToken,
      )
      await app().telemetry.capture(player.id, 'league_roster_requirement_assigned', { required_limit: result.requiredLimit })
      return null
    }),
  )

export const assignLeagueTeam = createServerFn({ method: 'POST' })
  .validator(assignLeagueTeamSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      const result = await app().service.assignLeagueTeam(data.token, player.id, data.userIds, data.eventToken)
      await app().telemetry.capture(player.id, 'league_team_assigned', { team_size: result.teamSize })
      return null
    }),
  )

export const makeLeagueRecurring = createServerFn({ method: 'POST' })
  .validator(tokenSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      await app().service.makeLeagueRecurring(data.token, player.id)
      return null
    }),
  )

export const updateLeague = createServerFn({ method: 'POST' })
  .validator(updateLeagueSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      const { token, ...input } = data
      await app().service.updateLeague(token, player.id, input)
      await app().telemetry.capture(player.id, 'league_updated', {
        visibility: input.visibility,
        admission: input.admission,
        player_limit_set: input.playerLimit !== null,
      })
      return null
    }),
  )

export const deleteLeague = createServerFn({ method: 'POST' })
  .validator(tokenSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      await app().service.deleteLeague(data.token, player.id)
      await app().telemetry.capture(player.id, 'league_deleted')
      return null
    }),
  )

export const createLeagueBattle = createServerFn({ method: 'POST' })
  .validator(createLeagueBattleSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      const result = await app().service.createLeagueBattle(
        player.id,
        data.token,
        data.opponentId,
        data.missionPackId,
        data.eventToken,
        data.allyId,
        data.secondOpponentId,
      )
      await app().telemetry.capture(player.id, 'league_battle_created', {
        format: result.format,
        required_limit: result.requiredLimit,
      })
      return { token: result.token }
    }),
  )
