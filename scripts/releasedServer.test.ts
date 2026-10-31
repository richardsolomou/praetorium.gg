import { existsSync } from 'node:fs'
import { mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'

// The test host stubs environment reads, so the module reads these instead.
const env = vi.hoisted((): Record<string, string> => ({}))
vi.mock('spacetime:sys@2.2', async (original) => ({ ...(await original<object>()), env_get: (key: string) => env[key] ?? null }))

import spacetime from '../spacetimedb/src/index'
import { moduleFetch, snake } from '../src/server/moduleFetch.fixtures'

/**
 * A deploy publishes this module while the released server still serves, for the minutes the new server takes to warm
 * up, so the released server must read what this module returns and write what it accepts. This runs the released
 * preview seed, which writes the preview data and reads back every procedure it reaches, against this module in memory.
 * CI points `RELEASED_CHECKOUT` at a checkout of the latest release.
 */
const released = process.env.RELEASED_CHECKOUT
/**
 * Procedures the preview seed's read-back leaves out: reads of guest seats, invite links, photos and imports it never creates,
 * then writes it has no reason to make. A procedure missing from both the seed and this list fails the check below.
 */
const UNREACHED = new Set([
  'change_rosters',
  'claim_imported_battle',
  'external_accounts_by_user',
  'link_external_account',
  'collection_photo',
  'collection_photo_for_admin',
  'friend_invite_by_token',
  'guest_device',
  'guest_seat_by_invite',
  'accept_friend_invite',
  'cancel_friend_invite',
  'claim_guest_seat',
  'delete_battle_for_operator',
  'delete_unit_loadout',
  'end_roster_loan',
  'guest_invite',
  'import_collection',
  'join_guest_seat',
  'lend_roster',
  'migrate_product_data',
  'public_standings_revision',
  'ratings_before',
  'reject_friend',
  'remove_battle',
  'remove_friend',
  'rename_unit_loadout',
  'replace_guest_invite',
  'save_ability_reminder',
  'save_unit_loadout',
  'set_player_defaults',
  'set_push_enabled',
  'set_roster_archived',
  'set_roster_locked',
  'set_roster_visibility',
  'share_battle',
  'submit_battle',
  'sync_product',
  'sync_receipt',
  'sync_roster',
  'update_onboarding',
])

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

it.skipIf(!released)('the released server reads and writes through this module', { timeout: 120_000 }, async () => {
  await expect(seedThrough(released!)).resolves.toBeDefined()
})

it('the preview seed calls every procedure it can reach', { timeout: 120_000 }, async () => {
  const called = await seedThrough('.')
  const procedures = spacetime.moduleDef.procedures.map(({ sourceName }) => snake(sourceName))
  expect(procedures.filter((name) => !called.has(name) && !UNREACHED.has(name))).toEqual([])
})

/** Runs a checkout's preview seed against this module and returns the procedures and reducers it called. */
async function seedThrough(checkoutPath: string) {
  const checkout = path.resolve(checkoutPath)
  // A bare release checkout has no packages or generated config of its own, so it borrows these.
  for (const name of ['node_modules', '.ras'])
    if (!existsSync(path.join(checkout, name))) await symlink(path.resolve(name), path.join(checkout, name), 'dir')

  const { called, request } = moduleFetch(env, 'http://127.0.0.1:8799/api/auth')
  // The released `SpacetimeOperator` calls the module over HTTP; this answers those calls from the module in memory.
  vi.stubGlobal('fetch', request)

  const directory = await mkdtemp(path.join(tmpdir(), 'praetorium-released-server-'))
  try {
    const { importAuthSqlite } = await import(path.join(checkout, 'scripts/nodeAuthSqlite.ts'))
    const seed = await import(path.join(checkout, 'scripts/seedPreview.ts'))
    const authSqlite = path.join(directory, 'auth.sqlite')
    await importAuthSqlite(path.join(checkout, 'drizzle-auth/0000_curly_gambit.sql'), authSqlite)
    for (const [name, value] of Object.entries({
      SPACETIME_URL: 'http://127.0.0.1:3999',
      SPACETIME_DATABASE: 'praetorium',
      SPACETIME_OPERATOR_TOKEN: 'operator',
      SPACETIME_AUDIENCE: 'praetorium',
      APP_URL: 'http://127.0.0.1:8799',
      AUTH_SECRET: 'praetorium-released-server-check',
      AUTH_RATE_LIMIT: 'off',
      PRAETORIUM_SEED_PREVIEW: 'true',
      AUTH_SQLITE_PATH: authSqlite,
    }))
      vi.stubEnv(name, value)
    // Twice: the first run writes the preview data, the second finds it and only reads.
    await seed.seedPreview(snapshots(seed.PREVIEW_ACCOUNTS))
    await seed.seedPreview(snapshots(seed.PREVIEW_ACCOUNTS))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
  return called
}

type SeededRoster = { id: string; name: string; catalogueId: string; limit: number; disposition: unknown }

/** A sealable army per seeded roster, so the seed runs without a catalogue: one unit, its Warlord. */
function snapshots(accounts: readonly { rosters: readonly SeededRoster[] }[]) {
  return new Map(
    accounts.flatMap((account) =>
      account.rosters.map((saved) => [
        saved.id,
        {
          id: saved.id,
          name: saved.name,
          text: `${saved.limit} pts`,
          built: {
            catalogueId: saved.catalogueId,
            revision: 'released-server-check',
            limit: saved.limit,
            detachment: null,
            disposition: saved.disposition,
            units: [
              {
                key: `${saved.id}-character`,
                name: `${saved.name} character`,
                points: 100,
                models: 1,
                group: 'character',
                warlord: true,
                warlordEligible: true,
              },
            ],
          },
        },
      ]),
    ),
  )
}
