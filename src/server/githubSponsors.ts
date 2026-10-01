import { z } from 'zod'
import { fetchWithRetry } from './fetch'

const GRAPHQL_URL = 'https://api.github.com/graphql'

/** Two thousand sponsors; a longer list fails the refresh rather than storing a truncated one. */
const MAX_PAGES = 20

/** How soon a player asking to check again may cost another GitHub request. */
const MIN_REFRESH_INTERVAL_MS = 30_000

// The token's own sponsorships, so the maintainer is whoever owns `GITHUB_SPONSORS_TOKEN`.
const SPONSORS_QUERY = `query ($after: String) {
  viewer {
    sponsorshipsAsMaintainer(first: 100, after: $after, activeOnly: true, includePrivate: true) {
      pageInfo { hasNextPage endCursor }
      nodes { privacyLevel sponsorEntity { __typename ... on User { databaseId } } }
    }
  }
}`

const sponsorsPage = z.object({
  data: z.object({
    viewer: z.object({
      sponsorshipsAsMaintainer: z.object({
        pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }),
        nodes: z.array(
          z.object({
            privacyLevel: z.enum(['PUBLIC', 'PRIVATE']),
            sponsorEntity: z.object({ __typename: z.string(), databaseId: z.number().int().optional() }).nullable(),
          }),
        ),
      }),
    }),
  }),
})

const graphqlErrors = z.object({ errors: z.array(z.object({ message: z.string() })).min(1) })

/** `githubId` is GitHub's numeric user id, which Better Auth stores as a linked GitHub account's `accountId`. */
export type GithubSponsor = { githubId: string; public: boolean }

type Request = (input: string, init: RequestInit) => Promise<Response>

/** Every user actively sponsoring the token's owner. An organization cannot link to a player, so it is left out. */
export async function activeGithubSponsors(token: string, request: Request = fetchWithRetry): Promise<GithubSponsor[]> {
  const sponsors: GithubSponsor[] = []
  let after: string | null = null
  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await request(GRAPHQL_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'praetorium.gg' },
      body: JSON.stringify({ query: SPONSORS_QUERY, variables: { after } }),
    })
    if (!response.ok) throw new Error(`GitHub sponsors request answered ${response.status}`)
    const body: unknown = await response.json()
    // A GraphQL error answers 200, so it has to be read out of the body; a missing scope is the usual one.
    const errors = graphqlErrors.safeParse(body)
    if (errors.success) throw new Error(`GitHub sponsors query failed: ${errors.data.errors.map((error) => error.message).join('; ')}`)
    const { nodes, pageInfo } = sponsorsPage.parse(body).data.viewer.sponsorshipsAsMaintainer
    for (const { privacyLevel, sponsorEntity } of nodes) {
      if (sponsorEntity?.__typename === 'User' && sponsorEntity.databaseId !== undefined)
        sponsors.push({ githubId: String(sponsorEntity.databaseId), public: privacyLevel === 'PUBLIC' })
    }
    if (!pageInfo.hasNextPage) return sponsors
    after = pageInfo.endCursor
  }
  throw new Error('GitHub sponsors exceed the page limit')
}

export type GithubSponsorRefresh = { configured: boolean; refresh: () => Promise<void> }

/**
 * Replaces the stored sponsor list with GitHub's, one request at a time per process.
 *
 * A failed request leaves the previous list in place, so an outage neither grants
 * nor removes a badge; the next refresh corrects it.
 */
export function githubSponsorRefresh(
  token: string | undefined,
  store: (sponsors: GithubSponsor[]) => Promise<void>,
  { request, now = Date.now }: { request?: Request; now?: () => number } = {},
): GithubSponsorRefresh {
  let running: Promise<void> | null = null
  let refreshedAt = Number.NEGATIVE_INFINITY
  return {
    configured: Boolean(token),
    refresh: () => {
      if (!token || now() - refreshedAt < MIN_REFRESH_INTERVAL_MS) return Promise.resolve()
      running ??= activeGithubSponsors(token, request)
        .then(store)
        .then(() => {
          refreshedAt = now()
        })
        .finally(() => {
          running = null
        })
      return running
    },
  }
}
