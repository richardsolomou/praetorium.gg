import { z } from 'zod'

export const SUPPORT_REPOSITORY = 'richardsolomou/praetorium.gg'
export const SUPPORT_REPORT_LIMIT = 100
export const supportReferenceSchema = z.uuid()
export const supportDraftSchema = z.strictObject({
  reference: supportReferenceSchema,
  kind: z.enum(['bug', 'rules-data', 'suggestion']),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(8_000),
  page: z.enum(['support', 'rosters', 'battle', 'reference', 'league', 'simulator', 'account', 'other']),
  appVersion: z
    .string()
    .regex(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/)
    .max(60),
  rulesVersion: z.string().trim().max(120),
  attachment: z.string().trim().max(8_000),
})
export const supportSubmissionSchema = supportDraftSchema.extend({ publishPublicly: z.literal(true) })
export type SupportDraft = z.infer<typeof supportDraftSchema>

export function supportPageForPath(path: string): SupportDraft['page'] {
  const root = path.split('/')[1]
  if (root === 'rosters') return 'rosters'
  if (root === 'battles') return 'battle'
  if (root === 'factions' || root === 'rules') return 'reference'
  if (root === 'leagues') return 'league'
  if (root === 'simulator') return 'simulator'
  if (root === 'profile' || root === 'account' || root === 'sign-in') return 'account'
  return root === 'support' ? 'support' : 'other'
}

export function publicSupportPayload(draft: SupportDraft) {
  return {
    title: `[${draft.kind}] ${draft.title}`,
    body: [
      draft.description,
      '',
      `Report reference: ${draft.reference}`,
      `Category: ${draft.kind}`,
      `Page: ${draft.page}`,
      `App version: ${draft.appVersion}`,
      ...(draft.rulesVersion ? [`Rules version: ${draft.rulesVersion}`] : []),
      ...(draft.attachment ? ['', 'Text attachment:', draft.attachment] : []),
    ].join('\n'),
  }
}

export const supportRecordSchema = z.strictObject({
  reference: supportReferenceSchema,
  title: z.string().max(180),
  body: z.string().max(17_000),
  createdAt: z.number().int().nonnegative(),
  delivery: z.enum(['sending', 'uncertain', 'refused', 'received']),
  issueNumber: z.number().int().positive().nullable(),
})
export type SupportRecord = z.infer<typeof supportRecordSchema>

export const supportStoreCommandSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('list') }),
  z.strictObject({ operation: z.literal('read'), reference: supportReferenceSchema }),
  z.strictObject({ operation: z.literal('check'), reference: supportReferenceSchema, now: z.number().int().nonnegative() }),
  z.strictObject({ operation: z.literal('create'), draft: supportDraftSchema, now: z.number().int().nonnegative() }),
  z.strictObject({
    operation: z.literal('finish'),
    reference: supportReferenceSchema,
    delivery: z.enum(['uncertain', 'refused', 'received']),
    issueNumber: z.number().int().positive().nullable(),
  }),
])
export type SupportStoreCommand = z.infer<typeof supportStoreCommandSchema>

export function supportIssueUrl(issueNumber: number) {
  return `https://github.com/${SUPPORT_REPOSITORY}/issues/${issueNumber}`
}
