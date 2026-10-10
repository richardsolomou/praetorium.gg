import { SpacetimeRequestError } from '../spacetimeOperator'
import { offlineActionSchema } from '../../contracts/offlineActions'
import { offlineActions } from '../offlineActions'
import { offlineContext } from '../offlineContext'
import { commandSchema } from '../../core/commands'
import { rosterSnapshot } from '../../core/rosterSnapshot'
import { rosterUseError } from '../../core/rosterLegality'
import { unitBattleDetailsIn } from '../../shared/catalogue'
import { calculateRosterPrice } from '../../shared/pricing'
import { createServerFn } from '@tanstack/react-start'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { app } from '../app'
import { requireUser } from '../playerSession'
import { mutationRpc, rpc } from '../rpc'
import { saveRosterSchema } from '../../contracts/schemas'
import { calculateRosterTotals } from '../../shared/pricing'

export const syncRoster = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      owner: z.string().min(1).max(128),
      operationId: z.uuid(),
      expectedVersion: z.number().int().nonnegative().nullable(),
      deleted: z.boolean().default(false),
      roster: saveRosterSchema.extend({ id: z.string().min(1).max(64), baseRosterId: z.string().min(1).max(64).nullable().optional() }),
    }),
  )
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      if (player.id !== data.owner || player.impersonatedBy)
        throw new Response('Sign in to the account that saved these changes', { status: 401 })
      const instance = app()
      const automaticName = !data.roster.name
      const totals =
        automaticName && !data.deleted
          ? calculateRosterTotals(
              { ...data.roster, units: data.roster.picks },
              await instance.catalogueFor(data.roster.catalogueId),
              await instance.rosterLabelRulesFor(),
            )
          : null
      const row = {
        ...data.roster,
        userId: player.id,
        automaticName,
        name: data.roster.name || totals?.label || '',
        detachmentId: JSON.stringify(data.roster.detachmentIds),
        picks: JSON.stringify(data.roster.picks),
        prep: data.roster.prep ? JSON.stringify(data.roster.prep) : null,
        tags: '[]',
        waivedRules: JSON.stringify(data.roster.waivedRules),
        optionalRules: JSON.stringify(data.roster.optionalRules),
        baseRosterId: data.roster.baseRosterId ?? null,
        now: Date.now(),
      }
      return instance.service.syncRoster({
        row: JSON.stringify(row),
        operationId: data.operationId,
        expectedVersion: data.expectedVersion,
        deleted: data.deleted,
        fingerprint: createHash('sha256')
          .update(JSON.stringify({ roster: data.roster, deleted: data.deleted }))
          .digest('hex'),
      })
    }),
  )

export const battleWorkspace = createServerFn({ method: 'GET' })
  .validator(z.object({ token: z.string().min(1).max(128) }))
  .handler(({ data }) =>
    rpc(async () => app().service.battleWorkspace(data.token, (await requireUser()).id, await app().battleReadRulesFor())),
  )

export const syncAction = createServerFn({ method: 'POST' })
  .validator(offlineActionSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      if (player.id !== data.owner || player.impersonatedBy)
        throw new Response('Sign in to the account that saved these changes', { status: 401 })
      const fingerprint = createHash('sha256')
        .update(JSON.stringify({ kind: data.kind, input: data.input, identifiers: data.identifiers }))
        .digest('hex')
      const receipt = await app().service.syncReceipt(data.operationId, player.id, fingerprint)
      if (receipt) return receipt
      try {
        await offlineContext.run(
          { id: data.operationId, owner: player.id, fingerprint, createdAt: data.createdAt, identifiers: data.identifiers, wrote: false },
          () => offlineActions[data.kind](player.id, data.input),
        )
        const saved = await app().service.syncReceipt(data.operationId, player.id, fingerprint)
        if (!saved) throw new Error('The saved action did not commit a receipt.')
        return saved
      } catch (error) {
        if (error instanceof Response && error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 429)
          return { outcome: 'refused' as const, message: (await error.text()).slice(0, 2_000) }
        if (error instanceof SpacetimeRequestError && error.status === 400)
          return { outcome: 'refused' as const, message: 'The server refused this saved action. Export your changes before discarding it.' }
        if (error instanceof z.ZodError)
          return { outcome: 'refused' as const, message: 'The saved action is incompatible with this application version.' }
        throw error
      }
    }),
  )

export const syncBattleCommand = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      owner: z.string().min(1).max(128),
      operationId: z.uuid(),
      token: z.string().min(1).max(128),
      expectedSeq: z.number().int().nonnegative().max(10_000),
      recordedAt: z.number().int().nonnegative(),
      catalogueRevision: z.string().min(1).max(128),
      command: commandSchema,
      capturedRoster: saveRosterSchema.extend({ id: z.string().min(1).max(128) }).optional(),
    }),
  )
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      if (player.id !== data.owner || player.impersonatedBy)
        throw new Response('Sign in to the account that saved these changes', { status: 401 })
      const instance = app()
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
        const draft = data.capturedRoster
        if (!draft || draft.id !== command.roster.id || !(await instance.service.ownRoster(player.id, draft.id)))
          return { outcome: 'refused' as const, message: 'You do not own the captured roster.' }
        const catalogue = await instance.catalogueFor(draft.catalogueId)
        if (!catalogue || !rules || catalogue.index.revision !== command.roster.built.revision)
          return {
            outcome: 'conflict' as const,
            message: 'Army data changed while you were offline. Your played roster is saved on this device; review it before syncing.',
          }
        const priced = calculateRosterPrice({ ...draft, units: draft.picks }, catalogue, rules)
        const problem = priced && rosterUseError(priced, draft.limit, draft.waivedRules)
        if (!priced || problem) return { outcome: 'refused' as const, message: problem || 'Army data is unavailable.' }
        command = {
          ...command,
          roster: rosterSnapshot(
            {
              ...draft,
              waivedRules: draft.waivedRules ?? [],
              reminders: draft.prep?.reminders,
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
      const fingerprint = createHash('sha256').update(JSON.stringify(data)).digest('hex')
      const { result } = await instance.service.submit(data.token, player.id, data.expectedSeq, command, rules, {
        operationId: data.operationId,
        fingerprint,
        recordedAt: data.recordedAt,
      })
      if (result.outcome === 'stale')
        return {
          outcome: 'conflict' as const,
          message: 'Another device advanced this battle. Your offline history is saved; review both histories before continuing.',
        }
      if (result.outcome === 'refused') return { outcome: 'refused' as const, message: result.reason }
      const { workspace } = await instance.service.battleWorkspace(data.token, player.id, await instance.battleReadRulesFor())
      return { outcome: 'applied' as const, workspace, version: workspace.serverSeq }
    }),
  )
