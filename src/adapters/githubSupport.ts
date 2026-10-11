import { z } from 'zod'
import { SUPPORT_REPOSITORY, type SupportRecord } from '../core/supportReport'

const ROOT = `https://api.github.com/repos/${SUPPORT_REPOSITORY}`
const issueSchema = z.object({
  number: z.number().int().positive(),
  title: z.string().max(256),
  body: z.string().max(65_536).nullable(),
  state: z.enum(['open', 'closed']),
  state_reason: z.enum(['completed', 'not_planned', 'reopened']).nullable().optional(),
  pull_request: z.unknown().optional(),
  user: z.object({ id: z.number().int().positive() }).optional(),
})
const commentSchema = z.object({
  id: z.number().int().positive(),
  body: z.string().max(65_536),
  created_at: z.string().max(40),
  user: z.object({ login: z.string().max(100) }).nullable(),
})
export type SupportIssue = z.infer<typeof issueSchema>
export type SupportReply = { id: number; body: string; at: string; author: string }
export type SupportGithub = ReturnType<typeof githubSupport>
type Request = (url: string, init: RequestInit) => Promise<Response>

async function boundedJson(response: Response) {
  if (!response.body) throw new Error('GitHub response is empty')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.length
      if (length > 2_000_000) throw new Error('GitHub response exceeds the limit')
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown
}

export function githubSupport(token: string | undefined, request: Request = fetch) {
  async function call(url: string, method = 'GET', body?: unknown, signal?: AbortSignal) {
    if (!token) throw new Error('Public support reporting is not configured')
    return request(url, {
      method,
      redirect: 'error',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'user-agent': 'praetorium.gg',
        'x-github-api-version': '2026-03-10',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  }
  async function read(url: string, signal?: AbortSignal) {
    const response = await call(url, 'GET', undefined, signal)
    if (!response.ok) throw new Error('GitHub support could not be read')
    return boundedJson(response)
  }
  return {
    configured: Boolean(token),
    async create(
      record: Pick<SupportRecord, 'title' | 'body'>,
    ): Promise<{ delivery: 'received'; issueNumber: number } | { delivery: 'refused' | 'uncertain'; issueNumber: null }> {
      try {
        const response = await call(`${ROOT}/issues`, 'POST', { title: record.title, body: record.body })
        if ([400, 401, 403, 404, 410, 422, 429].includes(response.status)) {
          await response.body?.cancel()
          return { delivery: 'refused', issueNumber: null }
        }
        if (response.status !== 201) {
          await response.body?.cancel()
          return { delivery: 'uncertain', issueNumber: null }
        }
        const issue = issueSchema.parse(await boundedJson(response))
        return { delivery: 'received', issueNumber: issue.number }
      } catch {
        // GitHub may have committed the issue before the connection or response failed.
        return { delivery: 'uncertain', issueNumber: null }
      }
    },
    async find(record: SupportRecord, signal?: AbortSignal): Promise<number | null> {
      const actor = z.object({ id: z.number().int().positive() }).parse(await read('https://api.github.com/user', signal))
      const query = `repo:${SUPPORT_REPOSITORY} is:issue in:body "${record.reference}"`
      const result = z
        .object({
          incomplete_results: z.boolean(),
          items: z.array(issueSchema).max(100),
        })
        .parse(await read(`https://api.github.com/search/issues?q=${encodeURIComponent(query)}&per_page=100`, signal))
      if (result.incomplete_results) throw new Error('GitHub support search is incomplete')
      const matches = result.items.filter(
        (issue) => !issue.pull_request && issue.user?.id === actor.id && issue.title === record.title && issue.body === record.body,
      )
      if (matches.length > 1) throw new Error('The support reference matches more than one issue')
      return matches[0]?.number ?? null
    },
    async issue(issueNumber: number, signal?: AbortSignal): Promise<SupportIssue> {
      const issue = issueSchema.parse(await read(`${ROOT}/issues/${issueNumber}`, signal))
      if (issue.pull_request || issue.number !== issueNumber) throw new Error('The support issue is unavailable')
      return issue
    },
    async replies(issueNumber: number, page: number, signal?: AbortSignal): Promise<{ replies: SupportReply[]; more: boolean }> {
      const comments = z
        .array(commentSchema)
        .max(30)
        .parse(await read(`${ROOT}/issues/${issueNumber}/comments?per_page=30&page=${page}`, signal))
      return {
        replies: comments.map((comment) => ({
          id: comment.id,
          body: comment.body,
          at: comment.created_at,
          author: comment.user?.login ?? 'Deleted user',
        })),
        more: comments.length === 30 && page < 100,
      }
    },
  }
}
