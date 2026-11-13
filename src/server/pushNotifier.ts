import type { PushMessage, PushSender } from '../adapters/push'
import { type Notice, type NoticeSubject, type StoredNotice, noticeMessage, noticeRecipients } from '../core/notifications'
import type { SpacetimeRepository } from './spacetimeRepository'
import { reportServerFailure } from '../adapters/posthog'

/** Told about a notice after its write has committed. Never awaited by the request that caused it. */
export type Notifier = { notify: (notices: readonly Notice[]) => void }

/** Campaign tags on the page a notification opens, so the pageview records which kind of notice brought the player back. */
export function campaignPath(path: string, kind: Notice['kind']) {
  return `${path}${path.includes('?') ? '&' : '?'}utm_source=praetorium-app&utm_medium=push&utm_campaign=${kind}`
}

/** An instance without a push service sends nothing, and nothing else changes. */
export const silentNotifier: Notifier = { notify: () => {} }

/** A notice with the name of its sealed event or group as it was when the notice was sent, which is what its recipient could read. */
type NamedNotice = StoredNotice & { subjectName?: string }

/** The name of each notice's sealed event or group as it is now; undefined for neither, or for one that has gone. */
async function subjectNames(repository: Pick<SpacetimeRepository, 'sealedEventNames' | 'groupNames'>, notices: readonly NoticeSubject[]) {
  const [sealedEvents, groups] = await Promise.all([
    repository.sealedEventNames(notices.flatMap((notice) => ('sealedEventToken' in notice ? [notice.sealedEventToken] : []))),
    repository.groupNames(notices.flatMap((notice) => ('groupToken' in notice ? [notice.groupToken] : []))),
  ])
  return notices.map((notice) =>
    'sealedEventToken' in notice
      ? sealedEvents.get(notice.sealedEventToken)
      : 'groupToken' in notice
        ? groups.get(notice.groupToken)
        : undefined,
  )
}

/** Each notice's words and page, naming its actor as they are now; null once its sealed event or group has no name. */
export async function describeNotices(repository: Pick<SpacetimeRepository, 'namesByIds'>, notices: readonly NamedNotice[]) {
  const names = await repository.namesByIds(notices.map((notice) => notice.actorId))
  return notices.map((notice) =>
    noticeMessage(notice, { actor: names.get(notice.actorId)?.name, sealedEvent: notice.subjectName, group: notice.subjectName }),
  )
}

type NamingRepository = Pick<SpacetimeRepository, 'namesByIds' | 'sealedEventNames' | 'groupNames'>

type PushRepository = Pick<SpacetimeRepository, 'pushTargets'> & NamingRepository

export function pushNotifier(repository: PushRepository, sender: PushSender): Notifier {
  async function deliver(notices: readonly Notice[]) {
    const addressed = notices.map((notice) => ({ notice, recipients: noticeRecipients(notice) })).filter((one) => one.recipients.length)
    const targets = await repository.pushTargets(addressed.flatMap((one) => one.recipients))
    if (!targets.length) return
    const subjects = await subjectNames(
      repository,
      addressed.map(({ notice }) => notice),
    )
    const described = await describeNotices(
      repository,
      addressed.map(({ notice }, index) => ({ ...notice, subjectName: subjects[index] })),
    )
    const messages: PushMessage[] = addressed.flatMap(({ notice, recipients }, index) => {
      const message = described[index]
      if (!message) return []
      const path = campaignPath(message.path, notice.kind)
      return targets.filter((target) => recipients.includes(target.userId)).map((target) => ({ to: target.token, ...message, path }))
    })
    if (messages.length) await sender.send(messages)
  }

  return {
    notify(notices) {
      void deliver(notices).catch((error: unknown) => reportServerFailure({ event: 'push_notice_failed', error }, 'warn'))
    },
  }
}

/**
 * Keeps every notice in its recipients' lists, then hands it to push, so each device and the website show the same notices.
 * The list keeps the sealed event's or group's name as it is now, so a recipient who later loses access never reads a newer one.
 */
export function storingNotifier(
  repository: Pick<SpacetimeRepository, 'storeNotices'> & NamingRepository,
  push: Notifier,
  clock = Date.now,
): Notifier {
  async function store(notices: readonly Notice[]) {
    const subjects = await subjectNames(repository, notices)
    await repository.storeNotices(
      notices.map((notice, index) => ({ ...notice, subjectName: subjects[index] })),
      clock(),
    )
  }

  return {
    notify(notices) {
      void store(notices).catch((error: unknown) => reportServerFailure({ event: 'notice_store_failed', error }, 'warn'))
      push.notify(notices)
    },
  }
}
