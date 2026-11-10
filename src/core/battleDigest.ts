import { listUnitCount } from './attachedUnits'
import {
  type BattleState,
  type BuiltRoster,
  type LoggedCommand,
  type PlayerId,
  sideCaptain,
  sideDisposition,
  sidePaintedPoints,
} from './battle'
import { opposingSide } from './battlePrimitives'
import { copiedArmy } from './rosterCopies'

/** Raise when what a digest holds changes, so every stored digest is folded again on its next read. */
export const BATTLE_DIGEST_VERSION = 1

/** What a list reads of one seat: its army's identity, never its units or the log that built it. */
export type DigestSeat = {
  id: PlayerId
  side: number
  automated: boolean
  /** The fielded list's name; null before one is attached. */
  army: string | null
  built: Omit<BuiltRoster, 'revision' | 'picks' | 'units' | 'strategicReserveLimit' | 'detachmentPointBudget' | 'dispositions'> | null
  /** The army and detachments a copy of the list would be saved under today, which discovery filters by. */
  copied: { catalogueId: string; detachmentIds: string[] } | null
  /** The datasheets the army fielded, by entry ID. */
  fielded: string[]
  unitCount: number
  primary: number
  secondary: number
  /** Primary plus secondary, with the side's painted bonus on the seat that carries the side's score. */
  score: number
  cpSpent: number
  /** The Force Dispositions this seat's side and the side it faces play, which choose its mission. */
  matchup: { own: string | null; opposing: string | null }
  stratagems: { key: string; name: string; cp: number; detachment?: string }[]
  /** Every card the seat held and kept, with what it scored; `secret` is one only its own side may name. */
  cards: { key: string; name: string; points: number; secret: boolean }[]
  primaryCard: { key: string; name: string } | null
}

/**
 * A battle as everything outside it reads it: one fold of its log, small enough for a list to read hundreds.
 *
 * Every reader of a battle it is not playing builds from this, so its answers match the battle's own. It names no
 * viewer, so readers apply who may see a secret card themselves.
 */
export type BattleDigest = Pick<
  BattleState,
  'status' | 'round' | 'phase' | 'firstPlayerId' | 'deploymentId' | 'settings' | 'result' | 'groupId' | 'eventToken' | 'sealedEventToken'
> & {
  version: number
  /** When the log last had a command, or null before its first. */
  lastCommandAt: number | null
  /** The seq of the log's last command, or 0 before its first: the version a device copy of the battle is saved at. */
  lastSeq: number
  seats: DigestSeat[]
}

export function battleDigest(state: BattleState, log: readonly Pick<LoggedCommand, 'at' | 'seq'>[]): BattleDigest {
  return {
    version: BATTLE_DIGEST_VERSION,
    status: state.status,
    round: state.round,
    phase: state.phase,
    firstPlayerId: state.firstPlayerId,
    deploymentId: state.deploymentId,
    settings: state.settings,
    result: state.result,
    groupId: state.groupId,
    eventToken: state.eventToken,
    sealedEventToken: state.sealedEventToken,
    lastCommandAt: log.at(-1)?.at ?? null,
    lastSeq: log.at(-1)?.seq ?? 0,
    seats: state.players.map((player) => {
      const built = player.roster?.built
      const opposing = opposingSide(state, player.side)
      const copy =
        built && copiedArmy({ catalogueId: built.catalogueId, detachmentIds: built.detachmentIds ?? [], picks: built.picks ?? [] })
      return {
        id: player.id,
        side: player.side,
        automated: player.automated,
        army: player.roster?.name ?? null,
        built: built
          ? {
              catalogueId: built.catalogueId,
              ...(built.edition ? { edition: built.edition } : {}),
              limit: built.limit,
              ...(built.pointsBudget === undefined ? {} : { pointsBudget: built.pointsBudget }),
              detachment: built.detachment,
              ...(built.detachments ? { detachments: built.detachments } : {}),
              disposition: built.disposition,
              ...(built.detachmentIds ? { detachmentIds: built.detachmentIds } : {}),
              ...(built.waivedRules ? { waivedRules: built.waivedRules } : {}),
            }
          : null,
        copied: copy ? { catalogueId: copy.catalogueId, detachmentIds: [...copy.detachmentIds] } : null,
        fielded: [
          ...new Set([...(built?.picks ?? []).map((pick) => pick.entryId), ...(built?.units ?? []).flatMap((unit) => unit.entryId ?? [])]),
        ],
        unitCount: listUnitCount(built?.picks ?? []),
        primary: player.primary,
        secondary: player.secondary,
        score:
          player.primary +
          player.secondary +
          (state.status !== 'setup' && player.id === sideCaptain(state, player.side).id ? sidePaintedPoints(state, player.side) : 0),
        cpSpent: player.cpSpent,
        matchup: {
          own: sideDisposition(state, player.side),
          opposing: opposing === undefined ? null : sideDisposition(state, opposing),
        },
        stratagems: player.uses.map(({ key, name, cp }) => {
          const detachment = player.stratagems.find((stratagem) => stratagem.key === key)?.detachment
          return { key, name, cp, ...(detachment ? { detachment } : {}) }
        }),
        cards: [...new Map(player.secondaries.map((secondary) => [secondary.key, secondary])).values()]
          .filter((secondary) => player.secondaryStatus[secondary.key] !== 'returned')
          .map(({ key, name }) => ({
            key,
            name,
            points: player.scored[key] ?? 0,
            secret: player.secretSecondary === key && !player.secretRevealed,
          })),
        primaryCard: player.primaryCard ? { key: player.primaryCard.key, name: player.primaryCard.name } : null,
      }
    }),
  }
}
