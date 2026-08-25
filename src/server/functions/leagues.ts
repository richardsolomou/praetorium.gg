import { createServerFn } from '@tanstack/react-start'
import { rosterSnapshot } from '../../core/rosterSnapshot'
import { app } from '../app'
import { currentUserId, requireUser } from '../playerSession'
import { calculateRosterPrice } from '../pricing'
import { mutationRpc, rpc } from '../rpc'
import {
  createLeagueBattleSchema,
  createLeagueSchema,
  leagueRosterSchema,
  moderateLeagueEntrySchema,
  submitLeagueRosterSchema,
  tokenSchema,
} from '../schemas'

export const listLeagues = createServerFn({ method: 'GET' }).handler(() => rpc(async () => app().service.leagues(await currentUserId())))

export const openLeague = createServerFn({ method: 'GET' })
  .validator(tokenSchema)
  .handler(({ data }) => rpc(async () => app().service.league(data.token, await currentUserId())))

export const createLeague = createServerFn({ method: 'POST' })
  .validator(createLeagueSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      const result = await app().service.createLeague(player.id, data)
      await app().telemetry.capture(player.id, 'league_created', { visibility: data.visibility, admission: data.admission })
      return result
    }),
  )

export const joinLeague = createServerFn({ method: 'POST' })
  .validator(tokenSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      const status = await app().service.joinLeague(data.token, player.id)
      await app().telemetry.capture(player.id, 'league_joined', { status })
      return status
    }),
  )

export const moderateLeagueEntry = createServerFn({ method: 'POST' })
  .validator(moderateLeagueEntrySchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      await app().service.moderateLeagueEntry(data.token, player.id, data.userId, data.status)
      return null
    }),
  )

export const submitLeagueRoster = createServerFn({ method: 'POST' })
  .validator(submitLeagueRosterSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      const roster = await app().service.ownRoster(player.id, data.rosterId)
      if (!roster) throw new Response('you do not own this roster', { status: 403 })
      const priced = calculateRosterPrice({
        catalogueId: roster.catalogueId,
        detachmentIds: roster.detachmentIds,
        disposition: roster.disposition,
        limit: roster.limit,
        units: roster.picks,
      })
      if (!priced) throw new Response('this instance has no catalogue', { status: 409 })
      await app().service.submitLeagueRoster(data.token, player.id, roster, rosterSnapshot(roster, priced))
      await app().telemetry.capture(player.id, 'league_roster_submitted')
      return null
    }),
  )

export const revealLeague = createServerFn({ method: 'POST' })
  .validator(tokenSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      await app().service.revealLeague(data.token, player.id)
      await app().telemetry.capture(player.id, 'league_rosters_revealed')
      return null
    }),
  )

export const openLeagueRoster = createServerFn({ method: 'GET' })
  .validator(leagueRosterSchema)
  .handler(({ data }) => rpc(() => app().service.leagueRoster(data.token, data.userId)))

export const createLeagueBattle = createServerFn({ method: 'POST' })
  .validator(createLeagueBattleSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      const result = await app().service.createLeagueBattle(player.id, data.token, data.opponentId, data.missionPackId)
      await app().telemetry.capture(player.id, 'league_battle_created')
      return result
    }),
  )
