import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { TypeSafeClient } from '@typesafe-ai/sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { classifyCombatRules, COMBAT_RULE_MODEL, combatRuleCacheKey, type InventoryRule } from './combatRuleShortlist'

const directories: string[] = []
async function cacheDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'combat-jev-'))
  directories.push(directory)
  return directory
}
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

const rule = (overrides: Partial<InventoryRule> = {}): InventoryRule => ({
  name: 'Example',
  description: 'The attacking unit can re-roll its failed hit rolls.',
  sources: ['Example army / Unit'],
  roles: [],
  calculatedRoles: [],
  calculated: false,
  status: 'not-combat',
  scopes: ['unit'],
  ...overrides,
})
const response = (attacker: number, defender: number) =>
  Response.json({
    model: COMBAT_RULE_MODEL,
    answers: { attacker: { type: 'noul', noul: attacker }, defender: { type: 'noul', noul: defender } },
    usage: { input_tokens: 123, output_tokens: 10 },
  })
const client = (fetch: (input: string, init?: RequestInit) => Promise<Response>) =>
  new TypeSafeClient({ apiKey: 'test-key', fetch, retry: { maxRetries: 0 }, logLevel: 'off' })

describe('Jev combat rule shortlisting', () => {
  it('keeps fluff with two negative judgments out of both the shortlist and review queue', async () => {
    const report = await classifyCombatRules(
      [rule({ description: 'Legends tell of warriors whose names echo across forgotten worlds.' })],
      {
        cacheDirectory: await cacheDirectory(),
        client: client(async () => response(0.05, 0.08)),
      },
    )
    expect({
      relevance: report.rules[0]?.relevance,
      neither: report.summary.neither,
      shortlist: report.shortlist.length,
      review: report.review.length,
    }).toEqual({ relevance: 'neither', neither: 1, shortlist: 0, review: 0 })
  })
  it('asks both independent roles even when the current classifier says not-combat', async () => {
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      if (typeof init?.body !== 'string') throw new Error('Expected a JSON request body')
      const body = JSON.parse(init.body)
      expect(body).toMatchObject({
        model: COMBAT_RULE_MODEL,
        state: { name: 'Example' },
        questions: { attacker: { type: 'noul' }, defender: { type: 'noul' } },
      })
      expect(body.state).not.toHaveProperty('calculated')
      return response(0.95, 0.05)
    })
    const report = await classifyCombatRules([rule()], { cacheDirectory: await cacheDirectory(), client: client(fetch) })
    expect(report.shortlist.map((entry) => entry.missingRoles)).toEqual([['attacker']])
  })
  it('can shortlist both roles and retains the independent probabilities', async () => {
    const report = await classifyCombatRules([rule()], {
      cacheDirectory: await cacheDirectory(),
      client: client(async () => response(0.94, 0.92)),
    })
    expect(report.shortlist[0]).toMatchObject({ missingRoles: ['attacker', 'defender'], probabilities: { attacker: 0.94, defender: 0.92 } })
  })
  it('keeps ambiguous labels in review rather than discarding them', async () => {
    const report = await classifyCombatRules([rule()], {
      cacheDirectory: await cacheDirectory(),
      client: client(async () => response(0.5, 0.1)),
    })
    expect({ shortlist: report.shortlist.length, review: report.review.map((entry) => entry.uncertainRoles) }).toEqual({
      shortlist: 0,
      review: [['attacker']],
    })
  })
  it('does not hide a missing defender role because the attacker wording is supported', async () => {
    const report = await classifyCombatRules([rule({ calculated: true, calculatedRoles: ['attacker'], status: 'calculated' })], {
      cacheDirectory: await cacheDirectory(),
      client: client(async () => response(0.9, 0.9)),
    })
    expect(report.shortlist[0]?.missingRoles).toEqual(['defender'])
  })
  it('reuses judgments but recomputes the shortlist after compiler support changes', async () => {
    const directory = await cacheDirectory()
    const fetch = vi.fn(async () => response(0.95, 0.05))
    await classifyCombatRules([rule()], { cacheDirectory: directory, client: client(fetch) })
    const report = await classifyCombatRules([rule({ calculated: true, calculatedRoles: ['attacker'], status: 'calculated' })], {
      cacheDirectory: directory,
      client: client(fetch),
    })
    expect({ calls: fetch.mock.calls.length, cached: report.summary.cached, shortlist: report.shortlist.length }).toEqual({
      calls: 1,
      cached: 1,
      shortlist: 0,
    })
  })
  it('invalidates cached judgments when the source wording changes', () => {
    expect(combatRuleCacheKey(rule())).not.toBe(combatRuleCacheKey(rule({ description: 'Only improve its armour save.' })))
  })
  it('rejects an incomplete response and never caches it as irrelevant', async () => {
    const directory = await cacheDirectory()
    const report = await classifyCombatRules([rule()], {
      cacheDirectory: directory,
      client: client(async () =>
        Response.json({
          model: COMBAT_RULE_MODEL,
          answers: { attacker: { type: 'noul', noul: 0.9 } },
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      ),
    })
    expect({ complete: report.complete, failed: report.summary.failed }).toEqual({ complete: false, failed: 1 })
    await expect(readFile(path.join(directory, `${combatRuleCacheKey(rule())}.json`))).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('reclassifies a corrupt cache entry', async () => {
    const directory = await cacheDirectory()
    await writeFile(path.join(directory, `${combatRuleCacheKey(rule())}.json`), '{broken')
    const report = await classifyCombatRules([rule()], { cacheDirectory: directory, client: client(async () => response(0.9, 0.1)) })
    expect(report.summary).toMatchObject({ cached: 0, requested: 1, failed: 0 })
  })
  it('bounds new requests and reports remaining rows as unclassified', async () => {
    const report = await classifyCombatRules([rule(), rule({ name: 'Another' })], {
      cacheDirectory: await cacheDirectory(),
      maxRequests: 1,
      client: client(async () => response(0.9, 0.1)),
    })
    expect({ complete: report.complete, pending: report.summary.unclassified, requests: report.summary.requested }).toEqual({
      complete: false,
      pending: 1,
      requests: 1,
    })
  })
  it('retains completed judgments and stops new requests after a service failure', async () => {
    const directory = await cacheDirectory()
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(0.9, 0.1))
      .mockResolvedValueOnce(new Response('secret body', { status: 401 }))
    const rows = [rule(), rule({ name: 'Second' }), rule({ name: 'Third' })]
    const first = await classifyCombatRules(rows, { cacheDirectory: directory, concurrency: 1, client: client(fetch) })
    const resumed = await classifyCombatRules(rows, { cacheDirectory: directory, client: client(async () => response(0.9, 0.1)) })
    expect({
      failed: first.summary.failed,
      deferred: first.summary.unclassified,
      calls: fetch.mock.calls.length,
      reused: resumed.summary.cached,
      complete: resumed.complete,
    }).toEqual({ failed: 1, deferred: 1, calls: 2, reused: 1, complete: true })
    expect(JSON.stringify(first)).not.toContain('secret body')
  })
  it('does not make requests after cancellation', async () => {
    const fetch = vi.fn(async () => response(0.9, 0.1))
    const report = await classifyCombatRules([rule()], {
      cacheDirectory: await cacheDirectory(),
      signal: AbortSignal.abort(),
      client: client(fetch),
    })
    expect({ calls: fetch.mock.calls.length, complete: report.complete }).toEqual({ calls: 0, complete: false })
  })
  it('treats the probability boundaries consistently', async () => {
    const report = await classifyCombatRules([rule()], {
      cacheDirectory: await cacheDirectory(),
      client: client(async () => response(0.8, 0.2)),
    })
    expect({ roles: report.rules[0]?.relevantRoles, uncertain: report.rules[0]?.uncertainRoles }).toEqual({
      roles: ['attacker'],
      uncertain: [],
    })
  })
  it('bounds concurrent requests rather than issuing the whole inventory at once', async () => {
    let active = 0,
      peak = 0
    const fetch = async () => {
      peak = Math.max(peak, ++active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active--
      return response(0.9, 0.1)
    }
    await classifyCombatRules(
      Array.from({ length: 7 }, (_, index) => rule({ name: `Rule ${index}` })),
      {
        cacheDirectory: await cacheDirectory(),
        concurrency: 2,
        client: client(fetch),
      },
    )
    expect(peak).toBe(2)
  })
  it('retries a rate limit through the SDK and records the successful judgment', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'retry-after-ms': '1' } }))
      .mockResolvedValueOnce(response(0.9, 0.1))
    const report = await classifyCombatRules([rule()], {
      cacheDirectory: await cacheDirectory(),
      client: new TypeSafeClient({ apiKey: 'test-key', fetch, retry: { maxRetries: 1 }, logLevel: 'off' }),
    })
    expect({ attempts: fetch.mock.calls.length, complete: report.complete, inputTokens: report.summary.inputTokens }).toEqual({
      attempts: 2,
      complete: true,
      inputTokens: 123,
    })
  })
  it('cancels an in-flight request without classifying the rule as irrelevant', async () => {
    const controller = new AbortController()
    const fetch = vi.fn(
      async (_url: string, init?: RequestInit): Promise<Response> =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
          controller.abort()
        }),
    )
    const report = await classifyCombatRules([rule()], {
      cacheDirectory: await cacheDirectory(),
      signal: controller.signal,
      client: client(fetch),
    })
    expect({ complete: report.complete, failed: report.summary.failed, probabilities: report.rules[0]?.probabilities }).toEqual({
      complete: false,
      failed: 1,
      probabilities: undefined,
    })
  })
  it('invalidates judgments when the pinned model changes', () => {
    expect(combatRuleCacheKey(rule(), 'jev-1.12.0')).not.toBe(combatRuleCacheKey(rule(), 'jev-1.13.0'))
  })
  it('refuses moving aliases before making requests', async () => {
    await expect(
      classifyCombatRules([rule()], {
        cacheDirectory: await cacheDirectory(),
        model: 'jev-latest',
        client: client(async () => response(0.9, 0.1)),
      }),
    ).rejects.toThrow('Pin a versioned Jev model')
  })
  it('keeps the complete description while bounding repetitive source labels', async () => {
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      if (typeof init?.body !== 'string') throw new Error('Expected JSON')
      const { state } = JSON.parse(init.body)
      expect(state.sources).toHaveLength(8)
      expect(state.description).toBe(rule().description)
      return response(0.9, 0.1)
    })
    const sources = Array.from({ length: 1000 }, (_, index) => `Army ${index} / Unit`)
    const report = await classifyCombatRules([rule({ sources })], { cacheDirectory: await cacheDirectory(), client: client(fetch) })
    expect(report.shortlist[0]?.sources).toHaveLength(1000)
  })
})
