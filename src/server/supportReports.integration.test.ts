import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { githubSupport } from '../adapters/githubSupport'
import { publicSupportPayload } from '../core/supportReport'
import { supportDraft } from '../core/supportReport.fixtures'
import { SpacetimeOperator } from './spacetimeOperator'
import { supportReports } from './supportReports'

const url = process.env.SPACETIME_TEST_URL
const database = process.env.SPACETIME_TEST_DATABASE
const token = process.env.SPACETIME_TEST_OPERATOR_TOKEN
const enabled = Boolean(url && database && token)
let operator: SpacetimeOperator
const owners: string[] = []
let origin = ''
let writes = 0
let loseResponse = false
let state: 'open' | 'closed' = 'open'
let replies: { id: number; body: string; created_at: string; user: { login: string } }[] = []
const issues: { number: number; title: string; body: string; state: string; state_reason: null; user: { id: number } }[] = []

const github = createServer(async (request, response) => {
  if (request.headers.authorization !== 'Bearer local-support-service') {
    response.writeHead(401).end()
    return
  }
  if (request.method === 'POST' && request.url === '/repos/richardsolomou/praetorium.gg/issues') {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    const payload = JSON.parse(Buffer.concat(chunks).toString()) as { title: string; body: string }
    const issue = { ...payload, number: ++writes, state: 'open', state_reason: null, user: { id: 7 } }
    issues.push(issue)
    if (loseResponse) {
      request.socket.destroy()
      return
    }
    response.writeHead(201, { 'content-type': 'application/json' }).end(JSON.stringify(issue))
    return
  }
  const parsed = new URL(request.url ?? '/', origin)
  if (parsed.pathname === '/user') {
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ id: 7 }))
    return
  }
  if (parsed.pathname === '/search/issues') {
    const reference = /"([^"]+)"/.exec(parsed.searchParams.get('q') ?? '')?.[1]
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ incomplete_results: false, items: issues.filter((issue) => issue.body.includes(reference ?? 'absent')) }))
    return
  }
  if (parsed.pathname.endsWith('/comments')) {
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify(replies))
    return
  }
  const issue = issues.find((entry) => parsed.pathname.endsWith(`/issues/${entry.number}`))
  if (!issue) {
    response.writeHead(404).end()
    return
  }
  response.setHeader('content-type', 'application/json')
  response.end(JSON.stringify({ ...issue, state, state_reason: state === 'closed' ? 'completed' : null }))
})

beforeAll(async () => {
  if (!enabled) return
  operator = new SpacetimeOperator(url!, database!, token!)
  await new Promise<void>((resolve) => github.listen(0, '127.0.0.1', resolve))
  const address = github.address()
  if (!address || typeof address === 'string') throw new Error('Missing local fake GitHub address')
  origin = `http://127.0.0.1:${address.port}`
})
afterAll(async () => {
  if (!enabled) return
  await Promise.all(owners.map((player) => operator.deleteUserData(player)))
  await new Promise<void>((resolve, reject) => github.close((error) => (error ? reject(error) : resolve())))
})

function service(clock: { now: number }) {
  return supportReports(
    (userId, command) => operator.supportReportCommand(userId, command),
    githubSupport('local-support-service', (endpoint, init) =>
      fetch(new URL(new URL(endpoint).pathname + new URL(endpoint).search, origin), init),
    ),
    () => clock.now,
  )
}
function owner() {
  const id = randomUUID()
  owners.push(id)
  return id
}

it.skipIf(!enabled)('persists one report for concurrent submit and delivers GitHub triage and reply to its requester', async () => {
  const player = owner()
  const stranger = owner()
  const clock = { now: 100_000 }
  const reports = service(clock)
  const draft = { ...supportDraft, reference: randomUUID() }
  const before = writes
  loseResponse = false
  const created = await Promise.all([
    reports.submit(player, { ...draft, publishPublicly: true }),
    reports.submit(player, { ...draft, publishPublicly: true }),
  ])
  expect(writes - before).toBe(1)
  expect(created.every((record) => record.reference === draft.reference)).toBe(true)
  const record = (await reports.list(player))[0]!
  expect({ title: record.title, body: record.body }).toEqual(publicSupportPayload(draft))
  expect(await reports.list(stranger)).toEqual([])
  await expect(reports.check(stranger, draft.reference, 1)).rejects.toThrow()
  state = 'closed'
  replies = [
    {
      id: 1,
      body: 'I reproduced the saved-flow problem and shipped the correction.',
      created_at: '2026-10-11T00:00:00Z',
      user: { login: 'maintainer' },
    },
  ]
  clock.now += 30_001
  const checked = await reports.check(player, draft.reference, 1)
  expect({ issue: checked.issue, replies: checked.replies }).toEqual({
    issue: { state: 'closed', reason: 'completed' },
    replies: [{ id: 1, body: replies[0]!.body, at: replies[0]!.created_at, author: 'maintainer' }],
  })
})

it.skipIf(!enabled)('reconciles a committed GitHub write after connection loss without posting again', async () => {
  const player = owner()
  const clock = { now: 200_000 }
  const reports = service(clock)
  const draft = { ...supportDraft, reference: randomUUID() }
  const before = writes
  loseResponse = true
  expect((await reports.submit(player, { ...draft, publishPublicly: true })).delivery).toBe('uncertain')
  loseResponse = false
  await reports.submit(player, { ...draft, publishPublicly: true })
  expect(writes - before).toBe(1)
  clock.now += 30_001
  expect((await reports.check(player, draft.reference, 1)).record.delivery).toBe('received')
  expect(writes - before).toBe(1)
})

it.skipIf(!enabled)('protects immutable reviewed content and deletes only the local account mapping', async () => {
  const player = owner()
  const clock = { now: 300_000 }
  const reports = service(clock)
  const draft = { ...supportDraft, reference: randomUUID() }
  await reports.submit(player, { ...draft, publishPublicly: true })
  await expect(reports.submit(player, { ...draft, title: 'Changed after publication', publishPublicly: true })).rejects.toThrow()
  const issued = issues.length
  await operator.deleteUserData(player)
  expect(await reports.list(player)).toEqual([])
  expect(issues.length).toBe(issued)
})

it.skipIf(!enabled)('limits report creation and reply checks atomically across callers', async () => {
  const player = owner()
  const clock = { now: 400_000 }
  const reports = service(clock)
  const first = await reports.submit(player, { ...supportDraft, reference: randomUUID(), publishPublicly: true })
  await expect(reports.submit(player, { ...supportDraft, reference: randomUUID(), publishPublicly: true })).rejects.toThrow()
  clock.now += 30_001
  const checked = await Promise.all([reports.check(player, first.reference, 1), reports.check(player, first.reference, 1)])
  expect(checked.filter((result) => result.checked).length).toBe(1)
})

it.skipIf(!enabled)('leaves a stalled sending record unconfirmed rather than claiming receipt or reposting', async () => {
  const player = owner()
  const clock = { now: 500_000 }
  const reports = service(clock)
  const draft = { ...supportDraft, reference: randomUUID() }
  await operator.supportReportCommand(player, { operation: 'create', draft, now: clock.now })
  const before = writes
  clock.now += 30_001
  const result = await reports.check(player, draft.reference, 1)
  expect(result.record.delivery).toBe('uncertain')
  expect(writes).toBe(before)
})

it.skipIf(!enabled)('rejects a non-operator reader of private report mappings', async () => {
  const response = await fetch(new URL('/v1/identity', url), { method: 'POST' })
  if (!response.ok) throw new Error('Local identity could not be created')
  const identity = (await response.json()) as { token: string }
  const outsider = new SpacetimeOperator(url!, database!, identity.token)
  await expect(outsider.supportReportCommand(owner(), { operation: 'list' })).rejects.toThrow('Operator required')
})
