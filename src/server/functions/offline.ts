import { captureBattleCommand } from '../battleTelemetry'
import { SpacetimeRequestError } from 'ras-stack/spacetime'
import { offlineActionSchema, type OfflineActionKind } from '../../contracts/offlineActions'
import { offlineActions } from '../offlineActions'
import { offlineContext } from '../offlineContext'
import { commandSchema, idSchema } from '../../core/commands'
import { currentOfflineAction } from '../../core/releasedNames'
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
import { captureWrite } from '../mutationTelemetry'
import { captureRosterCreated } from '../rosterTelemetry'
import { rosterRow } from '../rosterPersistence'

type SyncKind = OfflineActionKind | 'roster' | 'battle-command'

/** Answers a sync the player has to review on their device, which the request metrics would otherwise count as a success. */
async function unsynced<T extends { outcome: string }>(userId: string, kind: SyncKind, answer: T, cause?: string) {
  if (answer.outcome === 'refused' || answer.outcome === 'conflict')
    await app().telemetry.capture(userId, 'sync_refused', { kind, outcome: answer.outcome, ...(cause ? { cause } : {}) })
  return answer
}

async function syncRefusal(userId: string, kind: SyncKind, error: unknown) {
  if (error instanceof Response && error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 429)
    return unsynced(userId, kind, { outcome: 'refused' as const, message: (await error.text()).slice(0, 2_000) }, `http-${error.status}`)
  if (error instanceof SpacetimeRequestError && error.status === 400)
    return unsynced(
      userId,
      kind,
      { outcome: 'refused' as const, message: 'The server refused this saved action. Export your changes before discarding it.' },
      'database',
    )
  if (error instanceof z.ZodError)
    return unsynced(
      userId,
      kind,
      { outcome: 'refused' as const, message: 'The saved action is incompatible with this application version.' },
      'incompatible',
    )
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
              await instance.rulesFor(data.roster.catalogueId),
            )
          : null
      const row = {
        ...rosterRow(data.roster),
        userId: player.id,
        automaticName,
        name: data.roster.name || totals?.label || '',
        now: Date.now(),
      }
      const result = await instance.repository.syncRoster({
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
            data.roster.baseRosterId || data.roster.copiedFromRosterId
              ? { delivery: 'sync', variant: Boolean(data.roster.baseRosterId) }
              : { delivery: 'sync' },
          )
        else if (result.lifecycle === 'deleted') await captureWrite(player.id, 'roster_deleted', 'sync')
      }
      return unsynced(player.id, 'roster', result)
    }),
  )

export const battleWorkspace = createServerFn({ method: 'GET' })
  .validator(z.object({ token: z.string().min(1).max(128) }))
  .handler(({ data }) => rpc(async () => app().service.battleWorkspace(data.token, await requireUserId(), await app().rulesFor())))

export const syncAction = createServerFn({ method: 'POST' })
  .validator((data: z.input<typeof offlineActionSchema>) => offlineActionSchema.parse(currentOfflineAction(data)))
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireOwner(data.owner)
      const fingerprint = hash('sha256', JSON.stringify({ kind: data.kind, input: data.input, identifiers: data.identifiers }))
      try {
        let saved = await app().repository.syncReceipt(data.operationId, player.id, fingerprint)
        if (!saved) {
          await offlineContext.run(
            { id: data.operationId, owner: player.id, fingerprint, createdAt: data.createdAt, identifiers: data.identifiers, wrote: false },
            () => offlineActions[data.kind](player.id, data.input),
          )
          saved = await app().repository.syncReceipt(data.operationId, player.id, fingerprint)
        }
        if (!saved) throw new Error('The saved action did not commit a receipt.')
        if (saved.outcome === 'refused') return unsynced(player.id, data.kind, saved, 'database')
        if (saved.outcome === 'applied' && (data.kind === 'createBattle' || data.kind === 'createSealedEventBattle')) {
          const { workspace } = await app().service.battleWorkspace(data.identifiers.battleToken!, player.id, await app().rulesFor())
          return { ...saved, workspace, version: workspace.serverSeq }
        }
        return saved
      } catch (error) {
        return syncRefusal(player.id, data.kind, error)
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
            return unsynced(
              player.id,
              'battle-command',
              {
                outcome: 'conflict' as const,
                message:
                  'Army or game rules changed while you were offline. Your battle history is saved on this device; review it before syncing.',
              },
              'rules-changed',
            )
        }
        if (!replay && command.kind === 'attach-roster' && command.roster.built) {
          const captured = data.capturedRoster
          const owned =
            captured && captured.id === command.roster.id
              ? await instance.service.sealedEventService.ownRoster(player.id, captured.id)
              : null
          if (!captured || !owned)
            return unsynced(
              player.id,
              'battle-command',
              { outcome: 'refused' as const, message: 'You do not own the captured roster.' },
              'roster-not-owned',
            )
          // A device that predates custom budgets captured none; the saved roster's own budget applies.
          const draft = { ...captured, pointsBudget: captured.pointsBudget === undefined ? owned.pointsBudget : captured.pointsBudget }
          const catalogue = await instance.catalogueFor(draft.catalogueId)
          const rosterRules = await instance.rulesFor(draft.catalogueId)
          if (!catalogue || !rosterRules || catalogue.index.revision !== command.roster.built.revision)
            return unsynced(
              player.id,
              'battle-command',
              {
                outcome: 'conflict' as const,
                message: 'Army data changed while you were offline. Your played roster is saved on this device; review it before syncing.',
              },
              'roster-rules-changed',
            )
          const priced = calculateRosterPrice({ ...draft, units: draft.picks }, catalogue, rosterRules)
          const problem = priced && rosterUseError(priced, draft)
          if (!priced || problem)
            return unsynced(
              player.id,
              'battle-command',
              { outcome: 'refused' as const, message: problem || 'Army data is unavailable.' },
              priced ? 'roster-illegal' : 'roster-unpriced',
            )
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
                  await instance.repository.abilityRemindersByUser(player.id),
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
          return unsynced(
            player.id,
            'battle-command',
            {
              outcome: 'conflict' as const,
              message: 'Another device advanced this battle. Your offline history is saved; review both histories before continuing.',
            },
            'stale',
          )
        if (result.outcome === 'refused')
          return unsynced(player.id, 'battle-command', { outcome: 'refused' as const, message: result.reason }, result.code)
        const workspace = appended ?? (await instance.service.battleWorkspace(data.token, player.id, await instance.rulesFor())).workspace
        return { outcome: 'applied' as const, workspace, version: workspace.serverSeq }
      } catch (error) {
        return syncRefusal(player.id, 'battle-command', error)
      }
    }),
  )
