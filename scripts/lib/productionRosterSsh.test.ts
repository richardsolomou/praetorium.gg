import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { fetchProductionRostersOverSsh, normalisedRosterWriter } from './productionRosterSsh'

it('refuses SSH options disguised as a host', async () => {
  await expect(fetchProductionRostersOverSsh('-oProxyCommand=touch', 'web-production')).rejects.toThrow('Invalid production SSH host')
})

it('refuses shell syntax in a remote service name', async () => {
  await expect(fetchProductionRostersOverSsh('production', 'web; touch /tmp/injected')).rejects.toThrow('Invalid production web service')
})

describe('the production roster writer', () => {
  const revision = { definitions: 'abc', points: 'def' }
  const picks = [{ entryId: 'squad', spreads: { troopers: { rifle: 4, gunner: 1 } } }]
  const rewritten = [{ entryId: 'squad', spreads: { troopers: { rifle: 3, gunner: 1 } } }]
  const fields = { catalogueId: 'cat', detachmentIds: ['detachment'], borrowedDetachmentId: null }
  const row = {
    id: 'roster',
    userId: 'owner',
    name: 'Mine',
    automaticName: false,
    catalogueId: 'cat',
    detachmentId: '["detachment"]',
    disposition: null,
    limit: 2000,
    pointsBudget: null,
    picks: JSON.stringify(picks),
    prep: null,
    tags: '[]',
    waivedRules: '[]',
    optionalRules: '[]',
    borrowedDetachmentId: null,
    baseRosterId: null,
    locked: false,
    copiedFromRosterId: null,
    visibility: 'private',
    source: 'editable',
    createdAt: 1,
    updatedAt: 10,
  }
  const request = { id: 'roster', updatedAt: 10, expected: { ...fields, picks }, write: { ...fields, picks: rewritten } }

  /** The operator API's two procedures, with `sync_roster`'s version check. */
  async function run(stored: typeof row | null, options: { revision?: object; racing?: boolean } = {}) {
    const directory = await mkdtemp(path.join(tmpdir(), 'roster-writer-'))
    await writeFile(path.join(directory, 'revision.json'), JSON.stringify(options.revision ?? revision))
    let current = stored
    const syncs: { row: Record<string, unknown>; expectedVersion: number }[] = []
    const server = createServer((incoming, response) => {
      let body = ''
      incoming.on('data', (chunk) => (body += chunk))
      incoming.on('end', () => {
        const args = JSON.parse(body)
        const answer = (value: unknown) => response.end(JSON.stringify(JSON.stringify(value)))
        if (incoming.url?.endsWith('/roster_by_id')) return answer(current)
        const sync = JSON.parse(args[0])
        syncs.push({ row: JSON.parse(sync.row), expectedVersion: sync.expectedVersion })
        if (options.racing || sync.expectedVersion !== current?.updatedAt)
          return answer({ outcome: 'conflict', message: 'This roster changed on another device.' })
        current = { ...current!, ...JSON.parse(sync.row), updatedAt: current!.updatedAt + 1 }
        return answer({ outcome: 'applied', version: current!.updatedAt, deleted: false, lifecycle: null })
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo
    try {
      const child = await new Promise<{ stdout: string; stderr: string }>((resolve) => {
        const running = execFile(
          process.execPath,
          ['-e', normalisedRosterWriter, `http://127.0.0.1:${port}`],
          {
            env: {
              SPACETIME_INTERNAL_HOST: 'spacetime',
              SPACETIME_DATABASE: 'praetorium',
              SPACETIME_OPERATOR_TOKEN: 'token',
              CATALOGUE_DIR: directory,
            },
          },
          (_, stdout, stderr) => resolve({ stdout, stderr }),
        )
        running.stdin!.end(JSON.stringify({ revision, rosters: [request] }))
      })
      const outcomes = child.stdout
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
      return { outcomes, syncs, current, stderr: child.stderr }
    } finally {
      server.close()
      await rm(directory, { recursive: true, force: true })
    }
  }

  it('writes the rewrite against the version it read', async () => {
    const { outcomes, syncs } = await run(row)
    expect([outcomes, syncs.map((sync) => sync.expectedVersion)]).toEqual([[{ id: 'roster', outcome: 'written', reason: null }], [10]])
  })

  it('keeps every other saved field of the roster', async () => {
    const { syncs } = await run(row)
    expect(syncs[0]?.row).toMatchObject({
      name: 'Mine',
      userId: 'owner',
      detachmentId: '["detachment"]',
      visibility: 'private',
      tags: '[]',
    })
  })

  it('saves at the roster’s own time, so data updates since the player saved still reach it', async () => {
    const { syncs } = await run(row)
    expect(syncs[0]?.row.now).toBe(10)
  })

  it('saves the rewritten loadout', async () => {
    const { current } = await run(row)
    expect(JSON.parse(current!.picks)).toEqual(rewritten)
  })

  it('reports a roster that already holds the rewrite as current', async () => {
    const { outcomes, syncs } = await run({ ...row, picks: JSON.stringify(rewritten), updatedAt: 11 })
    expect([outcomes[0]?.outcome, syncs.length]).toEqual(['current', 0])
  })

  it('skips a roster the player edited since the snapshot', async () => {
    const { outcomes, syncs } = await run({ ...row, updatedAt: 12 })
    expect([outcomes[0], syncs.length]).toEqual([{ id: 'roster', outcome: 'skipped', reason: 'changed since the snapshot' }, 0])
  })

  it('skips a locked roster', async () => {
    expect((await run({ ...row, locked: true })).outcomes[0]?.reason).toBe('locked')
  })

  it('skips a deleted roster', async () => {
    expect((await run(null)).outcomes[0]?.reason).toBe('deleted')
  })

  it('leaves a roster alone when an edit races the write', async () => {
    const { outcomes, current } = await run(row, { racing: true })
    expect([outcomes[0]?.outcome, current?.picks]).toEqual(['skipped', row.picks])
  })

  it('writes nothing when production runs another catalogue revision', async () => {
    const { outcomes, syncs, stderr } = await run(row, { revision: { definitions: 'other' } })
    expect([outcomes.length, syncs.length, stderr.trim()]).toEqual([
      0,
      0,
      'Production catalogue revision differs from the one these rewrites were checked against',
    ])
  })
})
