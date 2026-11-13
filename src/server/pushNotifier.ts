import type { PushMessage, PushSender } from '../adapters/push'
import type { WebPushMessage, WebPushSender } from '../adapters/webPush'
import { type Notice, type NoticeSubject, type StoredNotice, noticeMessage, noticeRecipients } from '../core/notifications'
import type { SpacetimeRepository } from './spacetimeRepository'
import { reportServerFailure } from '../adapters/posthog'

/** Told about a notice after its write has committed. Never awaited by the request that caused it. */
export type Notifier = { notify: (notices: readonly Notice[]) => void }

/**
 * Campaign tags on the page a notification opens, so the pageview records which kind of notice brought the player back,
 * and the stored notice, which the page marks read.
 */
export function campaignPath(path: string, kind: Notice['kind'], noticeId?: string, medium: 'push' | 'web-push' = 'push') {
  const notice = noticeId ? `&notice=${noticeId}` : ''
  return `${path}${path.includes('?') ? '&' : '?'}utm_source=praetorium-app&utm_medium=${medium}&utm_campaign=${kind}${notice}`
}

/** A notice with its stored id for each recipient it was kept for. */
type IdentifiedNotice = Notice & { noticeIds?: Readonly<Record<string, string>> }

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
    noticeMessage(notice, { actor: notice.actorId ? names.get(notice.actorId)?.name : undefined, sealedEvent: notice.subjectName, group: notice.subjectName }),
  )
}

type NamingRepository = Pick<SpacetimeRepository, 'namesByIds' | 'sealedEventNames' | 'groupNames'>

type PushRepository = Pick<SpacetimeRepository, 'pushTargets' | 'webPushTargets'> & NamingRepository

/** Sends each notice to the recipient's app devices and browsers, through whichever senders this instance has. */
export function pushNotifier(repository: PushRepository, senders: { app: PushSender | null; web: WebPushSender | null }) {
  async function deliver(notices: readonly IdentifiedNotice[]) {
    const addressed = notices.map((notice) => ({ notice, recipients: noticeRecipients(notice) })).filter((one) => one.recipients.length)
    const recipientIds = addressed.flatMap((one) => one.recipients)
    const [devices, browsers] = await Promise.all([
      senders.app ? repository.pushTargets(recipientIds) : [],
      senders.web ? repository.webPushTargets(recipientIds) : [],
    ])
    if (!devices.length && !browsers.length) return
    const subjects = await subjectNames(
      repository,
      addressed.map(({ notice }) => notice),
    )
    const described = await describeNotices(
      repository,
      addressed.map(({ notice }, index) => ({ ...notice, subjectName: subjects[index] })),
    )
    const appMessages: PushMessage[] = []
    const webMessages: WebPushMessage[] = []
    addressed.forEach(({ notice, recipients }, index) => {
      const message = described[index]
      if (!message) return
      for (const device of devices) {
        if (!recipients.includes(device.userId)) continue
        const noticeId = notice.noticeIds?.[device.userId]
        appMessages.push({ to: device.token, ...message, path: campaignPath(message.path, notice.kind, noticeId), noticeId })
      }
      for (const { userId, ...subscription } of browsers) {
        if (!recipients.includes(userId)) continue
        const noticeId = notice.noticeIds?.[userId]
        webMessages.push({ to: subscription, ...message, path: campaignPath(message.path, notice.kind, noticeId, 'web-push') })
      }
    })
    await Promise.all([
      appMessages.length ? senders.app?.send(appMessages) : undefined,
      webMessages.length ? senders.web?.send(webMessages) : undefined,
    ])
  }

  return {
    notify(notices: readonly IdentifiedNotice[]) {
      void deliver(notices).catch((error: unknown) => reportServerFailure({ event: 'push_notice_failed', error }, 'warn'))
    },
  }
}

/**
 * Keeps every notice in its recipients' lists, then hands it to push with its stored ids, so each device and the website
 * show the same notices and a push can be cleared once its notice is read. A notice that fails to store is still pushed.
 * The list keeps the sealed event's or group's name as it is now, so a recipient who later loses access never reads a newer one.
 */
export function storingNotifier(
  repository: Pick<SpacetimeRepository, 'storeNotices'> & NamingRepository,
  push: { notify: (notices: readonly IdentifiedNotice[]) => void },
  clock = Date.now,
): Notifier {
  async function store(notices: readonly Notice[]) {
    const subjects = await subjectNames(repository, notices)
    return repository.storeNotices(
      notices.map((notice, index) => ({ ...notice, subjectName: subjects[index] })),
      clock(),
    )
  }

  return {
    notify(notices) {
      void store(notices)
        .catch((error: unknown) => {
          reportServerFailure({ event: 'notice_store_failed', error }, 'warn')
          return []
        })
        .then((ids) => push.notify(notices.map((notice, index) => ({ ...notice, noticeIds: ids[index] }))))
    },
  }
}
