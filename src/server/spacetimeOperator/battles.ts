import { z } from 'zod'
import { IMPORT_SOURCES, type ImportSource } from '../../core/importSources'
import { commandRefusal, reduceBattle, type Command, type LoggedCommand, type Refusal, type SubmitResult } from '../../core/battle'
import { commandSchema } from '../../core/commands'
import { battleFoldArgs } from '../../core/offlineBattle'
import { BATTLE_DIGEST_VERSION, type BattleDigest } from '../../core/battleDigest'
import type { BattleOrder } from '../../core/battleFilter'
import { feedCursor, type SpacetimeBase } from './client'

const battleSnapshot = z.object({
  battle: z.object({ id: z.string(), token: z.string(), createdAt: z.number().int() }),
  seats: z.array(z.object({ id: z.string(), side: z.number().int(), automated: z.boolean(), guestName: z.string().optional() })),
  log: z.array(
    z.object({
      seq: z.number().int(),
      by: z.string(),
      at: z.number().int(),
      command: commandSchema,
      operationId: z.uuid().optional(),
    }),
  ),
})
const battleLink = z.object({ invite: z.string(), invitedIds: z.array(z.string()) })
/** The release this server was built from, which keys the module's stored digests so a new release refolds each battle once. */
const DIGEST_REVISION = process.env.GITHUB_SHA?.trim() || 'development'

/** Built by this release's own module, so only its version is checked rather than parsing every seat again. */
const battleDigestRow = z.custom<BattleDigest>(
  (value) => typeof value === 'object' && value !== null && (value as BattleDigest).version === BATTLE_DIGEST_VERSION,
  'battle digest from another release',
)
const battleFeedResult = z.object({
  battles: z.array(
    z.object({ battle: battleSnapshot.shape.battle, seats: battleSnapshot.shape.seats, digest: battleDigestRow, at: z.number().int() }),
  ),
  nextCursor: feedCursor.nullable(),
})
const submission = z.object({
  applied: z.boolean().optional(),
  /** Set when the command listed a draft for the first time: every place filled and every army chosen. */
  listed: z.literal(true).optional(),
  result: z.discriminatedUnion('outcome', [
    z.object({ outcome: z.literal('stale'), seq: z.number().int() }),
    z.object({ outcome: z.literal('refused'), reason: z.string() }),
    z.object({ outcome: z.literal('appended'), seq: z.number().int() }),
  ]),
  log: battleSnapshot.shape.log,
})

export function withBattles<B extends SpacetimeBase>(Base: B) {
  return class BattleOperations extends Base {
    async battleForOperator(battleId: string) {
      return this.read('battle_for_operator', [battleId], battleSnapshot)
    }

    async battleChanges(after: number) {
      return this.read('battle_changes', [after], z.object({ cursor: z.number().int().nonnegative(), battleIds: z.array(z.string()) }))
    }

    async battlesForOperator(battleIds: readonly string[]) {
      return this.read('battles_for_operator', [battleIds], z.array(battleSnapshot))
    }

    async createBattle(input: {
      id: string
      token: string
      userId: string
      allyIds?: string[]
      opponentIds?: string[]
      guestNames?: string[]
      initialCommands?: Command[]
      now: number
      fixtureKey?: string
      draft?: boolean
      imported?: { source: ImportSource; sourceId: string; times: number[]; players: [string, string] }
    }) {
      return this.read(
        'create_battle',
        [
          JSON.stringify({
            id: input.id,
            token: input.token,
            userId: input.userId,
            allyIds: input.allyIds ?? [],
            opponentIds: input.opponentIds ?? [],
            guestNames: input.guestNames ?? [],
            initialCommands: input.initialCommands ?? [],
            now: input.now,
            ...(input.fixtureKey ? { fixtureKey: input.fixtureKey } : {}),
            ...(input.draft ? { draft: true } : {}),
            imported: input.imported,
          }),
        ],
        battleSnapshot,
      )
    }

    async seatBattlePlayer(input: { battleId: string; userId: string; side: 0 | 1; by: string; invite?: string; now: number }) {
      return this.read('seat_battle_player', [JSON.stringify(input)], z.enum(['joined', 'missing', 'not-yours', 'seated', 'started', 'full']))
    }

    async removeBattlePlayer(battleId: string, by: string, userId: string) {
      return this.reply('remove_battle_player', [battleId, by, userId], z.boolean())
    }

    async battleInvite(battleId: string, by: string, link: string, inviteeId?: string) {
      return this.read('battle_invite', [battleId, by, link, inviteeId ?? ''], battleLink.nullable())
    }

    async stopBattleInvite(battleId: string, by: string) {
      return this.reply('stop_battle_invite', [battleId, by], z.boolean())
    }

    async battleDraftState(battleId: string) {
      return this.read('battle_draft_state', [battleId], z.object({ draft: z.boolean(), invite: battleLink.nullable() }))
    }

    async battleByInvite(link: string) {
      return (await this.read('battle_by_invite', [link], battleSnapshot.nullable())) ?? undefined
    }

    async draftsByUser(userId: string) {
      return this.read('drafts_by_user', [userId, DIGEST_REVISION], battleFeedResult.shape.battles)
    }

    async sweepDrafts(before: number) {
      return this.reply('sweep_drafts', [before], z.number().int().nonnegative())
    }

    async claimImportedBattle(input: { source: ImportSource; sourceId: string; userId: string; playerId: string }) {
      return this.read('claim_imported_battle', [JSON.stringify(input)], z.enum(['absent', 'seated', 'unavailable', 'claimed']))
    }

    async linkExternalAccount(input: { source: ImportSource; playerId: string; userId: string; name: string }) {
      return this.reply('link_external_account', [JSON.stringify(input)], z.number().int().nonnegative())
    }

    async externalAccountsByUser(userId: string) {
      return this.read(
        'external_accounts_by_user',
        [userId],
        z.array(z.object({ source: z.enum(IMPORT_SOURCES), playerId: z.string(), name: z.string() })),
      )
    }

    async battleByToken(token: string) {
      return (await this.read('battle_by_token', [token], battleSnapshot.nullable())) ?? undefined
    }

    async battleFeed(input: {
      scope: 'user' | 'sealed-event' | 'group' | 'group-league' | 'public' | 'friends' | 'profile'
      userId?: string | null
      viewerId?: string | null
      withUserId?: string | null
      hostToken?: string | null
      eventToken?: string | null
      groupToken?: string
      before?: { at: number; id: string } | null
      order?: BattleOrder
      limit: number
    }) {
      return this.read(
        'battle_feed',
        [
          JSON.stringify({
            scope: input.scope,
            userId: input.userId ?? null,
            viewerId: input.viewerId ?? null,
            withUserId: input.withUserId ?? null,
            hostToken: input.hostToken ?? null,
            eventToken: input.eventToken ?? null,
            groupToken: input.groupToken,
            since: null,
            before: input.before ?? null,
            order: input.order,
            limit: input.limit,
            digests: DIGEST_REVISION,
          }),
        ],
        battleFeedResult,
      )
    }

    async deleteBattle(battleId: string, userId: string) {
      return this.reply('remove_battle', [battleId, userId], z.boolean())
    }

    /** Any battle, whoever opened it; the creator check in `deleteBattle` is the player's rule, not an administrator's. */
    async deleteBattleForOperator(battleId: string) {
      return this.reply('delete_battle_for_operator', [battleId], z.boolean())
    }

    async log(battleId: string) {
      return (await this.battleForOperator(battleId)).log
    }

    async submit(
      input: {
        battleId: string
        userId: string
        expectedSeq: number
        command: Command
        now: number
        operationId?: string
        fingerprint?: string
        recordedAt?: number
        /** The battle as the caller already read it; the product database still checks the sequence when it appends. */
        snapshot?: Pick<z.infer<typeof battleSnapshot>, 'seats' | 'log'>
        /** Whether the caller believes `userId` runs the battle's event; it only names a refusal, and the product database decides. */
        organizer?: boolean
      },
      validateState?: (state: ReturnType<typeof reduceBattle>) => Refusal | null,
      resolveCommand: (state: ReturnType<typeof reduceBattle>, command: Command) => Command = (_, command) => command,
    ): Promise<{ result: SubmitResult; log: LoggedCommand[]; applied?: boolean; listed?: true }> {
      const snapshot = input.snapshot ?? (await this.battleForOperator(input.battleId))
      const fold = (log: LoggedCommand[]) => reduceBattle(...battleFoldArgs(snapshot.seats, log))
      const state = fold(snapshot.log)
      const command = state.seq === input.expectedSeq ? commandSchema.parse(resolveCommand(state, input.command)) : input.command
      const externalRefusal = state.seq === input.expectedSeq ? (validateState?.(state) ?? null) : null
      const { result, log, applied, listed } = await this.read(
        'submit_battle',
        [
          input.battleId,
          input.userId,
          input.expectedSeq,
          JSON.stringify({
            ...command,
            ...(input.operationId
              ? { $sync: { operationId: input.operationId, fingerprint: input.fingerprint, at: input.recordedAt, reportApplied: true } }
              : {}),
          }),
          input.now,
          externalRefusal?.message ?? '',
        ],
        submission,
      )
      const application = { ...(applied === undefined ? {} : { applied }), ...(listed ? { listed } : {}) }
      if (result.outcome !== 'refused') return { result, log, ...application }
      // The product database answers with a message only, so the code is read from the
      // same rules over the log it refused against, before the resolver touched any state.
      const code = commandRefusal(fold(log), input.userId, command, input.organizer)?.code ?? externalRefusal?.code ?? 'unclassified'
      return { result: { ...result, code }, log, ...application }
    }
  }
}
