import {
  assertHealthHandlerConformance,
  assertMutationOriginConformance,
  assertPostHogBrowserConformance,
  assertPostHogRequestConformance,
} from 'ras-stack/conformance'
import { postHogRequestContext } from 'ras-stack/posthog'
import { postHogBrowserOptions } from 'ras-stack/posthog/client'
import { tanStackHealthHandler } from 'ras-stack/tanstack/server'
import { describe, expect, it } from 'vitest'
import { databaseUrl } from '../db/connection'
import { mutationRpc } from './rpc'

describe('shared infrastructure conformance', () => {
  it('preserves mutation origin checks', async () => {
    await expect(
      assertMutationOriginConformance((request) => mutationRpc(() => undefined, request), { trustForwardedHeaders: true }),
    ).resolves.toBeUndefined()
  })

  it('keeps health failures private', async () => {
    await expect(assertHealthHandlerConformance((check) => tanStackHealthHandler(check))).resolves.toBeUndefined()
  })

  it('insists on a Postgres URL', () => {
    expect(databaseUrl({ DATABASE_URL: 'postgres://user:pw@db:5432/praetorium' })).toBe('postgres://user:pw@db:5432/praetorium')
    expect(databaseUrl({ DATABASE_URL: 'postgresql://user:pw@db:5432/praetorium' })).toBe('postgresql://user:pw@db:5432/praetorium')
    // A missing or wrong-protocol URL must fail at boot, not on the first query.
    expect(() => databaseUrl({})).toThrow(/DATABASE_URL/)
    expect(() => databaseUrl({ DATABASE_URL: '  ' })).toThrow(/DATABASE_URL/)
    expect(() => databaseUrl({ DATABASE_URL: 'mysql://user:pw@db:3306/praetorium' })).toThrow(/postgres/)
  })

  it('keeps PostHog browser and request defaults safe', () => {
    expect(() =>
      assertPostHogBrowserConformance(postHogBrowserOptions({ apiHost: '/ingest', uiHost: 'https://us.posthog.com' })),
    ).not.toThrow()
    expect(() => assertPostHogRequestConformance(postHogRequestContext)).not.toThrow()
  })
})
