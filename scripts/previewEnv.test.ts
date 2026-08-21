import { describe, expect, it } from 'vitest'
import {
  assertPreviewDatabase,
  livePullRequests,
  databaseNameFrom,
  loadPreviewAppSecrets,
  previewDatabaseName,
  previewDatabaseUrl,
  previewEnv,
  pullRequestNumber,
} from './previewEnv'

const ADMIN = 'postgres://preview:secret@praetorium-preview-postgres:5432/postgres'

describe('preview app secrets', () => {
  it('loads an allowlisted key', () => {
    const target: Record<string, string | undefined> = {}
    loadPreviewAppSecrets({ PREVIEW_APP_SECRETS: JSON.stringify({ PREVIEW_DATABASE_ADMIN_URL: ADMIN }) }, target)
    expect(target.PREVIEW_DATABASE_ADMIN_URL).toBe(ADMIN)
  })

  it('refuses a key nobody meant to pass through', () => {
    expect(() => loadPreviewAppSecrets({ PREVIEW_APP_SECRETS: JSON.stringify({ AWS_SECRET_ACCESS_KEY: 'x' }) }, {})).toThrow(
      /unsupported key/,
    )
  })

  it('refuses anything that is not a JSON object of strings', () => {
    expect(() => loadPreviewAppSecrets({ PREVIEW_APP_SECRETS: '["a"]' }, {})).toThrow(/JSON object/)
    expect(() => loadPreviewAppSecrets({ PREVIEW_APP_SECRETS: JSON.stringify({ PREVIEW_DATABASE_ADMIN_URL: 7 }) }, {})).toThrow(
      /must be a string/,
    )
  })

  it('does nothing when the secret is absent, so a deploy without one fails later and clearly', () => {
    const target: Record<string, string | undefined> = {}
    loadPreviewAppSecrets({}, target)
    expect(target).toEqual({})
  })
})

describe('naming a preview database', () => {
  it('names it after the pull request', () => {
    expect(previewDatabaseName('165')).toBe('praetorium_pr_165')
    expect(databaseNameFrom(previewDatabaseUrl(ADMIN, '165'))).toBe('praetorium_pr_165')
  })

  it('keeps the rest of the admin connection intact', () => {
    expect(previewDatabaseUrl(ADMIN, '7')).toBe('postgres://preview:secret@praetorium-preview-postgres:5432/praetorium_pr_7')
  })

  /*
   * The reset drops whatever this resolves to, and DDL cannot be parameterised, so
   * these are the cases that keep an empty or hostile value from naming a database
   * somebody cares about.
   */
  it.each(['', ' ', 'abc', '1; drop database praetorium', '../praetorium', '1 2'])('refuses %j as a pull request number', (value) => {
    expect(() => pullRequestNumber(value)).toThrow(/PR_NUMBER/)
  })

  it.each(['praetorium', 'postgres', 'template1', '', 'praetorium_pr_', 'praetorium_pr_1x', 'PRAETORIUM_PR_1'])(
    'refuses %j as a preview database',
    (name) => {
      expect(() => assertPreviewDatabase(name)).toThrow(/not a preview database/)
    },
  )

  it('accepts only the shape it builds', () => {
    expect(assertPreviewDatabase('praetorium_pr_165')).toBe('praetorium_pr_165')
  })
})

describe('the environment a preview runs with', () => {
  const built = (source: Record<string, string | undefined>) =>
    Object.fromEntries(
      previewEnv('165', 'https://pr-165.praetorium.gg', source)
        .split('\n')
        .map((line) => line.split(/=(.*)/s).slice(0, 2) as [string, string]),
    )

  it('points the app at its own database and tells it how to reset it', () => {
    expect(built({ PREVIEW_DATABASE_ADMIN_URL: ADMIN })).toEqual({
      APP_URL: 'https://pr-165.praetorium.gg',
      PRAETORIUM_SEED_PREVIEW: 'true',
      DATABASE_URL: 'postgres://preview:secret@praetorium-preview-postgres:5432/praetorium_pr_165',
      PRAETORIUM_PREVIEW_ADMIN_DATABASE_URL: ADMIN,
    })
  })

  it('passes the snapshot mirror through when one is configured', () => {
    const entries = built({ PREVIEW_DATABASE_ADMIN_URL: ADMIN, CATALOGUE_SNAPSHOT_BASE_URL: 'https://example.test/c' })
    expect(entries.CATALOGUE_SNAPSHOT_BASE_URL).toBe('https://example.test/c')
  })

  // A preview is one replica, and a shared Valkey would put every preview's
  // sessions and rate-limit counters in one keyspace.
  it('never gives a preview a Valkey', () => {
    expect(built({ PREVIEW_DATABASE_ADMIN_URL: ADMIN, VALKEY_URL: 'redis://shared:6379' })).not.toHaveProperty('VALKEY_URL')
  })

  it('refuses to deploy without a database, rather than deploying something that cannot boot', () => {
    expect(() => previewEnv('165', 'https://pr-165.praetorium.gg', {})).toThrow(/PREVIEW_DATABASE_ADMIN_URL is required/)
  })
})

describe('which previews are still alive', () => {
  const names = ['praetorium-pr-12', 'praetorium-pr-165', 'praetorium', 'other-pr-99', 'praetorium-pr-x', 'praetorium-pr-']

  it('reads the open pull requests out of the application names', () => {
    expect(livePullRequests(names, 'praetorium', '165')).toEqual(['12', '165'])
  })

  it('always keeps the pull request being deployed, whose application may not exist yet', () => {
    expect(livePullRequests([], 'praetorium', '400')).toEqual(['400'])
  })

  it('ignores another application that happens to look similar', () => {
    expect(livePullRequests(['praetoriumx-pr-5', 'praetorium-pr-5-old'], 'praetorium', '1')).toEqual(['1'])
  })
})

describe('telling a preview what is still open', () => {
  const ADMIN_URL = 'postgres://preview:secret@preview-postgres:5432/postgres'
  const entries = (live: string[]) =>
    Object.fromEntries(
      previewEnv('165', 'https://pr-165.praetorium.gg', { PREVIEW_DATABASE_ADMIN_URL: ADMIN_URL }, live)
        .split('\n')
        .map((line) => line.split(/=(.*)/s).slice(0, 2) as [string, string]),
    )

  it('passes the live numbers through', () => {
    expect(entries(['12', '165']).PRAETORIUM_PREVIEW_LIVE_PR_NUMBERS).toBe('12 165')
  })

  // Absent means "could not tell", and the container must then drop nothing.
  it('says nothing when there is nothing to say', () => {
    expect(entries([])).not.toHaveProperty('PRAETORIUM_PREVIEW_LIVE_PR_NUMBERS')
  })
})
