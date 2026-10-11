import { z } from 'zod'
import { supportRecordSchema, supportSubmissionSchema, type SupportStoreCommand } from '../core/supportReport'
import type { SupportGithub } from '../adapters/githubSupport'

type Store = (userId: string, command: SupportStoreCommand) => Promise<unknown>

export function supportReports(store: Store, github: SupportGithub, now = Date.now) {
  async function owned(userId: string, reference: string) {
    const record = supportRecordSchema.nullable().parse(await store(userId, { operation: 'read', reference }))
    if (!record) throw new Response('Support report not found', { status: 404 })
    return record
  }
  return {
    configured: github.configured,
    async list(userId: string) {
      return z
        .array(supportRecordSchema)
        .max(100)
        .parse(await store(userId, { operation: 'list' }))
    },
    async submit(userId: string, value: unknown) {
      const input = supportSubmissionSchema.parse(value)
      if (!github.configured) throw new Response('In-app reporting is unavailable. Use the public issue tracker.', { status: 503 })
      const { publishPublicly: _consent, ...draft } = input
      const created = z
        .strictObject({ record: supportRecordSchema, created: z.boolean() })
        .parse(await store(userId, { operation: 'create', draft, now: now() }))
      if (!created.created) return created.record
      const result = await github.create(created.record)
      return supportRecordSchema.parse(await store(userId, { operation: 'finish', reference: input.reference, ...result }))
    },
    async check(userId: string, reference: string, page: number) {
      let record = await owned(userId, reference)
      if (!github.configured) return { record, issue: null, replies: [], more: false, checked: false }
      const allowed = z.boolean().parse(await store(userId, { operation: 'check', reference, now: now() }))
      if (!allowed) return { record, issue: null, replies: [], more: false, checked: false }
      const deadline = AbortSignal.timeout(25_000)
      if (record.delivery === 'sending' || record.delivery === 'uncertain') {
        const issueNumber = await github.find(record, deadline)
        if (issueNumber !== null)
          record = supportRecordSchema.parse(await store(userId, { operation: 'finish', reference, delivery: 'received', issueNumber }))
        else if (record.delivery === 'sending')
          record = supportRecordSchema.parse(
            await store(userId, { operation: 'finish', reference, delivery: 'uncertain', issueNumber: null }),
          )
      }
      if (!record.issueNumber) return { record, issue: null, replies: [], more: false, checked: true }
      const issue = await github.issue(record.issueNumber, deadline)
      const { replies, more } = await github.replies(record.issueNumber, page, deadline)
      return { record, issue: { state: issue.state, reason: issue.state_reason ?? null }, replies, more, checked: true }
    },
  }
}
