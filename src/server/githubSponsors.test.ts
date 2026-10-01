import { describe, expect, it, vi } from 'vitest'
import { activeGithubSponsors, githubSponsorRefresh, type GithubSponsor } from './githubSponsors'

type Node = { privacyLevel: 'PUBLIC' | 'PRIVATE'; sponsorEntity: { __typename: string; databaseId?: number } | null }

const page = (nodes: Node[], endCursor: string | null = null) =>
  Response.json({
    data: { viewer: { sponsorshipsAsMaintainer: { pageInfo: { hasNextPage: endCursor !== null, endCursor }, nodes } } },
  })

const user = (databaseId: number, privacyLevel: Node['privacyLevel'] = 'PUBLIC'): Node => ({
  privacyLevel,
  sponsorEntity: { __typename: 'User', databaseId },
})

describe('active GitHub sponsors', () => {
  it('reads each sponsoring user with whether the sponsorship is public', async () => {
    const request = vi.fn(async () => page([user(1), user(2, 'PRIVATE')]))

    expect(await activeGithubSponsors('token', request)).toEqual([
      { githubId: '1', public: true },
      { githubId: '2', public: false },
    ])
  })

  it('leaves out organizations, which no player can link', async () => {
    const request = vi.fn(async () => page([{ privacyLevel: 'PUBLIC', sponsorEntity: { __typename: 'Organization' } }]))

    expect(await activeGithubSponsors('token', request)).toEqual([])
  })

  it('follows every page of sponsors', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(page([user(1)], 'next'))
      .mockResolvedValueOnce(page([user(2)]))

    expect((await activeGithubSponsors('token', request)).map((sponsor) => sponsor.githubId)).toEqual(['1', '2'])
  })

  it('fails on a GraphQL error rather than reading it as no sponsors', async () => {
    const request = vi.fn(async () => Response.json({ data: null, errors: [{ message: 'Bad credentials' }] }))

    await expect(activeGithubSponsors('token', request)).rejects.toThrow('GitHub sponsors query failed: Bad credentials')
  })

  it('fails on an unsuccessful response', async () => {
    const request = vi.fn(async () => new Response('', { status: 401 }))

    await expect(activeGithubSponsors('token', request)).rejects.toThrow('GitHub sponsors request answered 401')
  })

  it('fails rather than storing a list cut short at the page limit', async () => {
    const request = vi.fn(async () => page([user(1)], 'next'))

    await expect(activeGithubSponsors('token', request)).rejects.toThrow('GitHub sponsors exceed the page limit')
  })
})

describe('sponsor refresh', () => {
  it('stores the sponsors GitHub answers with', async () => {
    const stored: GithubSponsor[][] = []
    const refresh = githubSponsorRefresh('token', async (sponsors) => void stored.push(sponsors), {
      request: async () => page([user(7)]),
    })

    await refresh.refresh()

    expect(stored).toEqual([[{ githubId: '7', public: true }]])
  })

  it('keeps the stored list when GitHub cannot be read', async () => {
    const store = vi.fn(async () => {})
    const refresh = githubSponsorRefresh('token', store, { request: async () => new Response('', { status: 502 }) })

    await expect(refresh.refresh()).rejects.toThrow()
    expect(store).not.toHaveBeenCalled()
  })

  it('shares one request between refreshes asked for at once', async () => {
    const request = vi.fn(async () => page([user(7)]))
    const refresh = githubSponsorRefresh('token', async () => {}, { request })

    await Promise.all([refresh.refresh(), refresh.refresh()])

    expect(request).toHaveBeenCalledTimes(1)
  })

  it('does not ask GitHub again within thirty seconds of a refresh', async () => {
    let now = 0
    const request = vi.fn(async () => page([user(7)]))
    const refresh = githubSponsorRefresh('token', async () => {}, { request, now: () => now })

    await refresh.refresh()
    now = 29_999
    await refresh.refresh()

    expect(request).toHaveBeenCalledTimes(1)
  })

  it('asks GitHub again once thirty seconds have passed', async () => {
    let now = 0
    const request = vi.fn(async () => page([user(7)]))
    const refresh = githubSponsorRefresh('token', async () => {}, { request, now: () => now })

    await refresh.refresh()
    now = 30_000
    await refresh.refresh()

    expect(request).toHaveBeenCalledTimes(2)
  })

  it('does nothing without a token', async () => {
    const request = vi.fn(async () => page([]))
    const refresh = githubSponsorRefresh(undefined, async () => {}, { request })

    await refresh.refresh()

    expect({ configured: refresh.configured, requests: request.mock.calls.length }).toEqual({ configured: false, requests: 0 })
  })
})
