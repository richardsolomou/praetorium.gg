import { APP_URL, classifyNavigation } from './navigation'
import { NOTICE_ID } from '../../src/core/notificationConfig'

const MAX_PATH_LENGTH = 2_048

/**
 * Where tapping a notification goes, from the path the server put in its data.
 *
 * Only a path on this application's own origin: a payload naming anywhere else,
 * or nothing usable, opens nothing rather than a page the shell did not expect.
 */
export function notificationUrl(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const path = (data as Record<string, unknown>).path
  if (typeof path !== 'string' || path.length > MAX_PATH_LENGTH || !path.startsWith('/') || path.startsWith('//')) return null
  try {
    const decision = classifyNavigation(new URL(path, APP_URL).href)
    return decision.kind === 'internal' ? decision.url : null
  } catch {
    return null
  }
}

/** The stored notice a notification is about, from the id the server put in its data; null for one sent before notices had ids. */
export function notificationNoticeId(data: unknown): string | null {
  const id = data && typeof data === 'object' ? (data as Record<string, unknown>).noticeId : undefined
  return typeof id === 'string' && NOTICE_ID.test(id) ? id : null
}
