import { newRecruitShareSchema } from '../core/newRecruit'
import { fetchWithRetry } from './fetch'

/** New Recruit publishes no API; this is the call its own share page makes, which needs no account. */
const endpoint = () => process.env.NEWRECRUIT_URL || 'https://www.newrecruit.eu'

/** The list a New Recruit share link opens, or null when the link opens nothing. */
export async function newRecruitShare(id: string) {
  const response = await fetchWithRetry(new URL('/api/rpc?m=open_share_link', endpoint()), {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://www.newrecruit.eu' },
    body: JSON.stringify({ method: 'open_share_link', params: [id] }),
  })
  if (!response.ok) throw new Response('New Recruit did not answer as expected. Try again later.', { status: 502 })
  const share = newRecruitShareSchema.safeParse(await response.json().catch(() => null))
  return share.success ? share.data : null
}
