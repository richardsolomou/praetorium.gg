import type { PushMessage, PushSender } from '../adapters/push'
import { type Notice, noticeMessage, noticeRecipients } from '../core/notifications'
import type { SpacetimeRepository } from './spacetimeRepository'
import { reportServerFailure } from '../adapters/posthog'

/** Told about a notice after its write has committed. Never awaited by the request that caused it. */
export type Notifier = { notify: (notices: readonly Notice[]) => void }

/** An instance without a push service sends nothing, and nothing else changes. */
export const silentNotifier: Notifier = { notify: () => {} }

type PushRepository = Pick<SpacetimeRepository, 'pushTargets' | 'namesByIds' | 'leagueNames' | 'clubNames'>

export function pushNotifier(repository: PushRepository, sender: PushSender): Notifier {
  async function deliver(notices: readonly Notice[]) {
    const addressed = notices.map((notice) => ({ notice, recipients: noticeRecipients(notice) })).filter((one) => one.recipients.length)
    const targets = await repository.pushTargets(addressed.flatMap((one) => one.recipients))
    if (!targets.length) return
    const leagueTokens = addressed.flatMap(({ notice }) => ('leagueToken' in notice ? [notice.leagueToken] : []))
    const clubTokens = addressed.flatMap(({ notice }) => ('clubToken' in notice ? [notice.clubToken] : []))
    const [names, leagues, clubs] = await Promise.all([
      repository.namesByIds(addressed.map(({ notice }) => notice.actorId)),
      repository.leagueNames(leagueTokens),
      repository.clubNames(clubTokens),
    ])
    const messages: PushMessage[] = addressed.flatMap(({ notice, recipients }) => {
      const message = noticeMessage(notice, {
        actor: names.get(notice.actorId)?.name,
        league: 'leagueToken' in notice ? leagues.get(notice.leagueToken) : undefined,
        club: 'clubToken' in notice ? clubs.get(notice.clubToken) : undefined,
      })
      if (!message) return []
      return targets.filter((target) => recipients.includes(target.userId)).map((target) => ({ to: target.token, ...message }))
    })
    if (messages.length) await sender.send(messages)
  }

  return {
    notify(notices) {
      void deliver(notices).catch((error: unknown) => reportServerFailure({ event: 'push_notice_failed', error }, 'warn'))
    },
  }
}
