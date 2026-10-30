import type { PushMessage, PushSender } from '../adapters/push'
import { type Notice, noticeMessage, noticeRecipients } from '../core/notifications'
import type { SpacetimeRepository } from './spacetimeRepository'
import { reportServerFailure } from '../adapters/posthog'

/** Told about a notice after its write has committed. Never awaited by the request that caused it. */
export type Notifier = { notify: (notices: readonly Notice[]) => void }

/** An instance without a push service sends nothing, and nothing else changes. */
export const silentNotifier: Notifier = { notify: () => {} }

type PushRepository = Pick<SpacetimeRepository, 'pushTargets' | 'namesByIds' | 'sealedEventNames' | 'groupNames'>

export function pushNotifier(repository: PushRepository, sender: PushSender): Notifier {
  async function deliver(notices: readonly Notice[]) {
    const addressed = notices.map((notice) => ({ notice, recipients: noticeRecipients(notice) })).filter((one) => one.recipients.length)
    const targets = await repository.pushTargets(addressed.flatMap((one) => one.recipients))
    if (!targets.length) return
    const sealedEventTokens = addressed.flatMap(({ notice }) => ('sealedEventToken' in notice ? [notice.sealedEventToken] : []))
    const groupTokens = addressed.flatMap(({ notice }) => ('groupToken' in notice ? [notice.groupToken] : []))
    const [names, sealedEvents, groups] = await Promise.all([
      repository.namesByIds(addressed.map(({ notice }) => notice.actorId)),
      repository.sealedEventNames(sealedEventTokens),
      repository.groupNames(groupTokens),
    ])
    const messages: PushMessage[] = addressed.flatMap(({ notice, recipients }) => {
      const message = noticeMessage(notice, {
        actor: names.get(notice.actorId)?.name,
        sealedEvent: 'sealedEventToken' in notice ? sealedEvents.get(notice.sealedEventToken) : undefined,
        group: 'groupToken' in notice ? groups.get(notice.groupToken) : undefined,
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
