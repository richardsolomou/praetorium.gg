import { reduceBattle } from '../core/battle'
import { battleDigest } from '../core/battleDigest'
import { setTimeout } from 'node:timers/promises'
import { z } from 'zod'
import { EVENT_CHANNEL_NAME_MAX_LENGTH, type EventChannelUpdate, eventChannelMessage } from '../core/eventChannel'
import { type Notice, sealedEventPath } from '../core/notifications'
import { battleFoldArgs } from '../core/offlineBattle'
import { sideScore } from '../core/standings'
import { battleSummary } from '../shared/battleSummary'
import { reportServerFailure } from '../adapters/posthog'
import type { Notifier } from './pushNotifier'
import type { RepositoryPort } from './spacetimeRepository'
import type { SealedEventResultsService } from './services/sealedEventResultsService'

type ChannelRepository = Pick<RepositoryPort, 'eventChannelTarget' | 'recordEventChannelDelivery' | 'battlesByIds' | 'namesByIds'>

type Target = NonNullable<Awaited<ReturnType<RepositoryPort['eventChannelTarget']>>>

type PairedRound = SealedEventResultsService['pairedRound']

/** Told about a battle that finished, after the command that finished it committed. Never awaited by that request. */
export type BattleFinishListener = { battleFinished: (battleId: string) => void }

export const silentBattleFinishListener: BattleFinishListener = { battleFinished: () => {} }

const SUPPRESS_EMBEDS = 1 << 2
const RETRY_WAIT_MAX_MS = 30_000

/**
 * Posts league and tournament updates to the Discord channel an organizer saved, from the same notices players get and
 * from each battle that finishes for a league fixture or a sealed event. Every post names only what the page it links to
 * shows anyone reading the event, and no update exists before a sealed event's reveal. The webhook address never reaches
 * a log: a failed post reports a fixed event name.
 */
export class EventChannels implements BattleFinishListener {
  constructor(
    private readonly repository: ChannelRepository,
    private readonly pairedRound: PairedRound,
    /** Links back to the app, so without it nothing posts. */
    private readonly origin: string | undefined = process.env.APP_URL,
    private readonly request: typeof fetch = fetch,
    private readonly clock = Date.now,
  ) {}

  noticed(notices: readonly Notice[]) {
    for (const notice of notices) this.background(() => this.postNotice(notice))
  }

  battleFinished(battleId: string) {
    this.background(() => this.postResult(battleId))
  }

  private background(task: () => Promise<void>) {
    if (!this.origin) return
    void task().catch((error: unknown) => reportServerFailure({ event: 'event_channel_post_failed', error }, 'warn'))
  }

  private async postNotice(notice: Notice) {
    if (notice.kind === 'sealed-event-revealed') {
      const target = await this.repository.eventChannelTarget('sealed-event', notice.sealedEventToken, notice.eventToken)
      if (target) await this.post(target, { kind: 'revealed', name: target.name, link: this.link(sealedEventPath(notice)) })
    }
    if (notice.kind === 'sealed-event-round-paired') {
      const target = await this.repository.eventChannelTarget('sealed-event', notice.sealedEventToken, notice.eventToken)
      if (!target) return
      const { tables, standings } = await this.pairedRound(notice.sealedEventToken, notice.eventToken, notice.round, notice.actorId)
      const names = await this.repository.namesByIds([
        ...tables.flatMap((table) => (table.bId === null ? [table.aId] : [table.aId, table.bId])),
        ...standings.map((row) => row.userId),
      ])
      const name = (id: string) => names.get(id)?.name ?? 'A player'
      await this.post(target, {
        kind: 'paired',
        name: target.name,
        round: notice.round,
        tables: tables.map((table) => ({ table: table.table, a: name(table.aId), b: table.bId === null ? null : name(table.bId) })),
        standings: standings.map((row) => ({ ...row, name: name(row.userId) })),
        link: this.link(sealedEventPath(notice)),
      })
    }
    if (notice.kind === 'group-league-deadline-reminder') {
      const target = await this.repository.eventChannelTarget('group', notice.groupToken)
      if (target)
        await this.post(target, {
          kind: 'deadline',
          name: target.name,
          round: notice.round,
          link: this.link(`/groups/${encodeURIComponent(notice.groupToken)}?tab=league`),
        })
    }
  }

  private async postResult(battleId: string) {
    const target = await this.repository.eventChannelTarget('battle', battleId)
    if (!target) return
    const [history] = await this.repository.battlesByIds([battleId])
    if (!history) return
    const state = reduceBattle(...battleFoldArgs(history.players, history.log))
    if (state.status !== 'finished') return
    const summary = battleSummary(history, battleDigest(state, history.log), null, null, new Map())
    const sides = [...new Set(summary.sides)].map((side) => ({
      names: summary.players.filter((_, seat) => summary.sides[seat] === side),
      score: sideScore(summary, side),
    }))
    await this.post(target, {
      kind: 'result',
      name: target.name,
      league: target.league,
      sides,
      link: this.link(`/battles/${encodeURIComponent(summary.token)}`),
    })
  }

  private link(path: string) {
    return new URL(path, this.origin).href
  }

  private async post(target: Target, update: EventChannelUpdate) {
    let outcome = await this.send(target.url, update)
    // A finished round can end many tables at once, past Discord's per-webhook limit, so a limited post waits its turn once.
    if (typeof outcome === 'number') {
      await setTimeout(Math.min(outcome, RETRY_WAIT_MAX_MS))
      outcome = await this.send(target.url, update)
    }
    if (typeof outcome === 'string') await this.repository.recordEventChannelDelivery(target.hostId, target.url, outcome, this.clock())
  }

  /** How Discord took the post, or for a rate limit, which says nothing about the channel, how long to wait in milliseconds. */
  private async send(url: string, update: EventChannelUpdate): Promise<'sent' | 'failed' | 'refused' | number> {
    try {
      const response = await this.request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: eventChannelMessage(update), allowed_mentions: { parse: [] }, flags: SUPPRESS_EMBEDS }),
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      })
      if (response.ok) return 'sent'
      // Discord answers a deleted webhook or a wrong token this way, and neither recovers.
      if (response.status === 401 || response.status === 403 || response.status === 404) return 'refused'
      if (response.status === 429) {
        const { retry_after: seconds } = z
          .object({ retry_after: z.number().nonnegative() })
          .catch({ retry_after: 1 })
          .parse(await response.json().catch(() => null))
        return seconds * 1000
      }
      reportServerFailure({ event: 'event_channel_post_refused', status: response.status }, 'warn')
      return 'failed'
    } catch {
      // A fetch error can quote the address, which posts as the channel, so only the fact of it is reported.
      reportServerFailure({ event: 'event_channel_post_unreachable' }, 'warn')
      return 'failed'
    }
  }
}

/**
 * The name Discord gives a webhook, which proves the link still posts somewhere before it is saved. A webhook's token
 * reads it without any other credential.
 */
export async function discordWebhookName(url: string, request: typeof fetch = fetch) {
  let response: Response
  try {
    response = await request(url, { redirect: 'error', signal: AbortSignal.timeout(10_000) })
  } catch {
    throw new Response('Discord didn’t answer, so try again in a moment', { status: 502 })
  }
  if (!response.ok)
    throw new Response('Discord doesn’t know that webhook link. Copy it again from the channel’s settings.', { status: 400 })
  const { name } = z.object({ name: z.string() }).parse(await response.json())
  return name.slice(0, EVENT_CHANNEL_NAME_MAX_LENGTH)
}

/** Hands every notice on to `inner`, and the ones a channel posts to `channels`. */
export function channelNotifier(inner: Notifier, channels: Pick<EventChannels, 'noticed'>): Notifier {
  return {
    notify(notices) {
      inner.notify(notices)
      channels.noticed(notices)
    },
  }
}
