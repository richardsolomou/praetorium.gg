import { createIsomorphicFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { GUEST_DRAFT_COOKIE } from '../contracts/guestDraft'

/** Whether the request, or the page in the browser, carries a visitor's draft cookie. */
const holdsDraft = (cookies: string | null) => (cookies ?? '').split(';').some((cookie) => cookie.trim() === `${GUEST_DRAFT_COOKIE}=1`)

export const guestDraftHint = createIsomorphicFn()
  .server(() => holdsDraft(getRequest().headers.get('cookie')))
  .client(() => holdsDraft(document.cookie))
