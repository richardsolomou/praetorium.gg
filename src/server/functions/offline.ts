import { captureBattleCommand } from '../battleTelemetry'
import { SpacetimeRequestError } from 'ras-stack/spacetime'
import { offlineActionSchema } from '../../contracts/offlineActions'
import { offlineActions } from '../offlineActions'
import { offlineContext } from '../offlineContext'
import { commandSchema, idSchema } from '../../core/commands'
import { rosterSnapshot } from '../../core/rosterSnapshot'
import { fieldingReminders } from '../../shared/reminderAbilities'
import { rosterUseError } from '../../core/rosterLegality'
import { unitBattleDetailsIn } from '../../shared/catalogue'
import { calculateRosterPrice, calculateRosterTotals } from '../../shared/pricing'
import { createServerFn } from '@tanstack/react-start'
import { hash } from 'node:crypto'
import { z } from 'zod'
import { app } from '../app'
import { requireUser, requireUserId } from '../playerSession'
import { mutationRpc, rpc } from '../rpc'
import { saveRosterSchema } from '../../contracts/schemas'
import { captureRosterCreated } from '../rosterTelemetry'
import { rosterRow } from '../rosterPersistence'

async function syncRefusal(error: unknown) {
  if (error instanceof Response && error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 429)
    return { outcome: 'refused' as const, message: (await error.text()).slice(0, 2_000) }
  if (error instanceof SpacetimeRequestError && error.status === 400)
    return { outcome: 'refused' as const, message: 'The server refused this saved action. Export your changes before discarding it.' }
  if (error instanceof z.ZodError)
    return { outcome: 'refused' as const, message: 'The saved action is incompatible with this application version.' }
  throw error
}

/** The signed-in player, refused unless they queued the work themselves rather than while impersonated. */
async function requireOwner(owner: string) {
  const player = await requireUser()
  if (player.id !== owner || player.impersonatedBy) throw new Response('Sign in to the account that saved these changes', { status: 401 })
  return player
}

const offlineOperation = offlineActionSchema.pick({ owner: true, operationId: true })

export const syncRoster = createServerFn({ method: 'POST' })
  .validator(
    offlineOperation.extend({
      expectedVersion: z.number().int().nonnegative().nullable(),
      deleted: z.boolean().default(false),
      roster: saveRosterSchema.safeExtend({
        id: idSchema,
        baseRosterId: idSchema.nullable().optional(),
        copiedFromRosterId: idSchema.nullable().optional(),
      }),
    }),
  )
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireOwner(data.owner)
      const instance = app()
      const automaticName = !data.roster.name
      const totals =
        automaticName && !data.deleted
          ? calculateRosterTotals(
              { ...data.roster, units: data.roster.picks },
              await instance.catalogueFor(data.roster.catalogueId),
              await instance.rosterLabelRulesFor(data.roster.catalogueId),
            )
          : null
      const row = {
        ...rosterRow(data.roster),
        userId: player.id,
        automaticName,
        name: data.roster.name || totals?.label || '',
        now: Date.now(),
      }
      const result = await instance.service.syncRoster({
        row: JSON.stringify(row),
        operationId: data.operationId,
        expectedVersion: data.expectedVersion,
        deleted: data.deleted,
        fingerprint: hash('sha256', JSON.stringify({ roster: data.roster, deleted: data.deleted })),
      })
      if (result.outcome === 'applied') {
        if (result.lifecycle === 'created')
          await captureRosterCreated(
            instance,
            player.id,
            data.roster,
            data.roster.baseRosterId || data.roster.copiedFromRosterId ? { variant: Boolean(data.roster.baseRosterId) } : {},
          )
        else if (result.lifecycle === 'deleted') await instance.telemetry.capture(player.id, 'roster_deleted')
      }
      return result
    }),
  )

export const battleWorkspace = createServerFn({ method: 'GET' })
  .validator(z.object({ token: z.string().min(1).max(128) }))
  .handler(({ data }) =>
    rpc(async () => app().service.battleWorkspace(data.token, await requireUserId(), await app().battleReadRulesFor())),
  )

export const syncAction = createServerFn({ method: 'POST' })
  .validator(offlineActionSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireOwner(data.owner)
      const fingerprint = hash('sha256', JSON.stringify({ kind: data.kind, input: data.input, identifiers: data.identifiers }))
      try {
        let saved = await app().service.syncReceipt(data.operationId, player.id, fingerprint)
        if (!saved) {
          await offlineContext.run(
            { id: data.operationId, owner: player.id, fingerprint, createdAt: data.createdAt, identifiers: data.identifiers, wrote: false },
            () => offlineActions[data.kind](player.id, data.input),
          )
          saved = await app().service.syncReceipt(data.operationId, player.id, fingerprint)
        }
        if (!saved) throw new Error('The saved action did not commit a receipt.')
        if (saved.outcome === 'applied' && (data.kind === 'createBattle' || data.kind === 'createLeagueBattle')) {
          const { workspace } = await app().service.battleWorkspace(
            data.identifiers.battleToken!,
            player.id,
            await app().battleReadRulesFor(),
          )
          return { ...saved, workspace, version: workspace.serverSeq }
        }
        return saved
      } catch (error) {
        return syncRefusal(error)
      }
    }),
  )

export const syncBattleCommand = createServerFn({ method: 'POST' })
  .validator(
    offlineOperation.extend({
      token: z.string().min(1).max(128),
      expectedSeq: z.number().int().nonnegative().max(10_000),
      recordedAt: z.number().int().nonnegative(),
      catalogueRevision: z.string().min(1).max(128),
      command: commandSchema,
      capturedRoster: saveRosterSchema.safeExtend({ id: z.string().min(1).max(128) }).optional(),
    }),
  )
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireOwner(data.owner)
      try {
        const instance = app()
        const startedAt = performance.now()
        let command = data.command
        const replay = await instance.service.hasBattleOperation(data.token, player.id, data.operationId)
        const rules = await instance.rulesFor()
        if (!replay) {
          const catalogue = instance.catalogue()
          if (!catalogue || !rules) throw new Response('Army and game rules are unavailable. Try syncing again later.', { status: 503 })
          if (catalogue.index.revision !== data.catalogueRevision)
            return {
              outcome: 'conflict' as const,
              message:
                'Army or game rules changed while you were offline. Your battle history is saved on this device; review it before syncing.',
            }
        }
        if (!replay && command.kind === 'attach-roster' && command.roster.built) {
          const captured = data.capturedRoster
          const owned =
            captured && captured.id === command.roster.id ? await instance.service.leagueService.ownRoster(player.id, captured.id) : null
          if (!captured || !owned) return { outcome: 'refused' as const, message: 'You do not own the captured roster.' }
          // A device that predates custom budgets captured none; the saved roster's own budget applies.
          const draft = { ...captured, pointsBudget: captured.pointsBudget === undefined ? owned.pointsBudget : captured.pointsBudget }
          const catalogue = await instance.catalogueFor(draft.catalogueId)
          const rosterRules = await instance.rulesFor(draft.catalogueId)
          if (!catalogue || !rosterRules || catalogue.index.revision !== command.roster.built.revision)
            return {
              outcome: 'conflict' as const,
              message: 'Army data changed while you were offline. Your played roster is saved on this device; review it before syncing.',
            }
          const priced = calculateRosterPrice({ ...draft, units: draft.picks }, catalogue, rosterRules)
          const problem = priced && rosterUseError(priced, draft)
          if (!priced || problem) return { outcome: 'refused' as const, message: problem || 'Army data is unavailable.' }
          command = {
            ...command,
            roster: rosterSnapshot(
              {
                ...draft,
                waivedRules: draft.waivedRules ?? [],
                reminders: fieldingReminders(
                  catalogue,
                  rosterRules,
                  draft,
                  priced.units,
                  await instance.service.abilityReminders(player.id),
                ),
                remindersEnabled: draft.prep?.remindersEnabled,
              },
              priced,
              unitBattleDetailsIn(
                catalogue,
                draft.catalogueId,
                draft.picks.map((pick) => pick.entryId),
              ),
            ),
          }
        }
        const fingerprint = hash('sha256', JSON.stringify(data))
        const {
          result,
          workspace: appended,
          applied,
          battleId,
          finished,
        } = await instance.service.submitWithWorkspace(data.token, player.id, data.expectedSeq, command, rules, {
          operationId: data.operationId,
          fingerprint,
          recordedAt: data.recordedAt,
        })
        if (result.outcome !== 'appended' || applied === true)
          await captureBattleCommand(player.id, battleId, command, { result, finished }, performance.now() - startedAt, 'sync')
        if (result.outcome === 'stale')
          return {
            outcome: 'conflict' as const,
            message: 'Another device advanced this battle. Your offline history is saved; review both histories before continuing.',
          }
        if (result.outcome === 'refused') return { outcome: 'refused' as const, message: result.reason }
        const workspace =
          appended ?? (await instance.service.battleWorkspace(data.token, player.id, await instance.battleReadRulesFor())).workspace
        return { outcome: 'applied' as const, workspace, version: workspace.serverSeq }
      } catch (error) {
        return syncRefusal(error)
      }
    }),
  )
