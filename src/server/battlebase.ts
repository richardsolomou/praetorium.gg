import { createHash } from 'node:crypto'
import { z } from 'zod'
import { fetchWithRetry } from './fetch'

/**
 * BattleBase publishes no API; this is the one its own web app reads, which answers public battles without signing in.
 * `BATTLEBASE_URL` points a local stack at a stand-in.
 */
const endpoint = () => process.env.BATTLEBASE_URL || 'https://www.battlebase.app/graphql'
const PAGE = 50
/** Enough for a very active player's whole history, and a bound on what one import asks BattleBase for. */
const MAX_BATTLES = 500

const BATTLE_FIELDS =
  'id createdAt isFinished createdBy { id username isTestOpponent } opponent { id username isTestOpponent } eventsJson battleSetupJson'

const player = z.object({ id: z.string(), username: z.string(), tagline: z.string().nullable() })

async function query<T extends z.ZodType>(schema: T, document: string, variables: Record<string, unknown>): Promise<z.infer<T>> {
  const response = await fetchWithRetry(endpoint(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: document, variables }),
  })
  const body = response.ok ? z.object({ data: z.unknown() }).safeParse(await response.json().catch(() => null)) : null
  const data = body?.success ? schema.safeParse(body.data.data) : null
  if (!data?.success) throw new Response('BattleBase did not answer as expected. Try again later.', { status: 502 })
  return data.data
}

/** A BattleBase player by the name they go by now, or by the id that stays theirs when they rename. */
export async function battlebasePlayer(by: { username: string } | { id: string }) {
  const { user } = await query(
    z.object({ user: player.nullable() }),
    'username' in by
      ? 'query Player($username: String!) { user(username: $username) { id username tagline } }'
      : 'query Player($id: ID!) { user(id: $id) { id username tagline } }',
    by,
  )
  return user
}

/** Every public battle a player has on BattleBase, newest first, left unparsed so one unreadable battle skips only itself. */
export async function battlebaseBattles(id: string) {
  const battles: { id: string }[] = []
  for (let before: string | undefined; battles.length < MAX_BATTLES;) {
    const { user } = await query(
      z.object({ user: z.object({ battles: z.array(z.looseObject({ id: z.string() })) }).nullable() }),
      `query Battles($id: ID!, $last: Int, $before: ID) { user(id: $id) { battles(last: $last, before: $before) { ${BATTLE_FIELDS} } } }`,
      { id, last: PAGE, before },
    )
    const page = user?.battles ?? []
    battles.push(...page)
    if (page.length < PAGE) break
    before = page.at(-1)!.id
  }
  return battles.slice(0, MAX_BATTLES)
}

/** A player's public BattleBase rosters, newest first; null when no player has that name. */
export async function battlebaseRosters(username: string) {
  const { user } = await query(
    z.object({
      user: z
        .object({ rosters: z.array(z.object({ id: z.string(), data: z.string(), updatedAt: z.string().nullish() })).max(500) })
        .nullable(),
    }),
    'query Rosters($username: String!) { user(username: $username) { rosters { id data updatedAt } } }',
    { username },
  )
  return user?.rosters.toSorted((left, right) => (right.updatedAt ?? '').localeCompare(left.updatedAt ?? '')) ?? null
}

/**
 * The code a player puts in their BattleBase tagline to show the account is theirs.
 *
 * It is bound to the Praetorium account and the BattleBase name, so a code shown to one
 * player proves nothing about anyone else's battles.
 */
export function battlebaseCode(userId: string, username: string) {
  return `praetorium-${createHash('sha256').update(`${userId}:${username.toLowerCase()}`).digest('hex').slice(0, 10)}`
}
