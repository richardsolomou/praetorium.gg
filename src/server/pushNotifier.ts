import type { PushMessage, PushSender } from '../adapters/push'
import { type Notice, noticeMessage, noticeRecipients } from '../core/notifications'
import type { Repository } from '../db/repository'

/** Told about a notice after its write has committed. Never awaited by the request that caused it. */
export type Notifier = { notify: (notices: readonly Notice[]) => void }

/** An instance without a push service sends nothing, and nothing else changes. */
export const silentNotifier: Notifier = { notify: () => {} }

type PushRepository = Pick<Repository, 'pushTargets' | 'namesByIds' | 'leagueNames'>

export function pushNotifier(
  repository: PushRepository,
  sender: PushSender,
  log = (error: unknown) => console.warn('push notice failed', { error }),
) {
  async function deliver(notices: readonly Notice[]) {
    const addressed = notices.map((notice) => ({ notice, recipients: noticeRecipients(notice) })).filter((one) => one.recipients.length)
    const targets = await repository.pushTargets(addressed.flatMap((one) => one.recipients))
    if (!targets.length) return
    const leagueTokens = addressed.flatMap(({ notice }) => ('leagueToken' in notice ? [notice.leagueToken] : []))
    const [names, leagues] = await Promise.all([
      repository.namesByIds(addressed.map(({ notice }) => notice.actorId)),
      repository.leagueNames(leagueTokens),
    ])
    const messages: PushMessage[] = addressed.flatMap(({ notice, recipients }) => {
      const message = noticeMessage(notice, {
        actor: names.get(notice.actorId)?.name,
        league: 'leagueToken' in notice ? leagues.get(notice.leagueToken) : undefined,
      })
      if (!message) return []
      return targets.filter((target) => recipients.includes(target.userId)).map((target) => ({ to: target.token, ...message }))
    })
    if (messages.length) await sender.send(messages)
  }

  return {
    deliver,
    notify(notices: readonly Notice[]) {
      void deliver(notices).catch(log)
    },
  }
}
