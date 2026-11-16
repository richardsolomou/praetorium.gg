import { createHash } from 'node:crypto'
import { PostHog } from 'posthog-node'

/** The PostHog transactional email templates this build sends; each one's description lists the variables it reads. */
export const EMAIL_TEMPLATES = {
  resetPassword: '01a1a6ef-23a5-0000-71ad-ab4ecf440259',
  verifyEmail: '01a1a6ef-a479-0000-0f9f-b48394b54d78',
  supportReply: '01a1a6ef-ef51-0000-4124-91e385f37dcc',
  photoReport: '01a1a6f0-3155-0000-f0ac-2364d5028fb6',
  importFailure: '01a1a6f0-6399-0000-a746-1ac2e0ac3bbc',
} as const

export type EmailTemplate = keyof typeof EMAIL_TEMPLATES

export type EmailMessage = {
  template: EmailTemplate
  to: string
  /** The recipient's account id, so the send lands on the same person as their events. */
  distinctId?: string
  data: Record<string, string>
  /** Makes a repeat of the same send within 24 hours a no-op; a repeat with different data is refused. */
  idempotencyKey?: string
}

export type EmailDelivery = { send(message: EmailMessage): Promise<void> }

/** Sends through PostHog transactional email with a key scoped to sending email; undefined where none is configured. */
export function emailDelivery(environment: NodeJS.ProcessEnv = process.env): EmailDelivery | undefined {
  const secretKey = environment.POSTHOG_EMAIL_API_KEY
  const projectToken = environment.VITE_POSTHOG_PROJECT_TOKEN
  if (!secretKey || !projectToken) return undefined
  // A key that may only send email cannot poll flag definitions, which local evaluation would try at startup.
  const posthog = new PostHog(projectToken, { host: environment.VITE_POSTHOG_HOST, secretKey, enableLocalEvaluation: false })

  return {
    async send({ template, to, distinctId, data, idempotencyKey }) {
      const templateId = EMAIL_TEMPLATES[template]
      if (!templateId) throw new Error(`EMAIL_TEMPLATES.${template} has no PostHog template id`)
      const { error } = await posthog.emails.send({ templateId, to, distinctId, templateData: data, idempotencyKey })
      if (error) throw error
    },
  }
}

type AuthEmail = { user: { id: string; email: string }; url: string; token: string }

/**
 * Better Auth's password-reset and verification callbacks, which wait for PostHog to queue each email. A retried request
 * for the same token sends once; the token is a secret, so the idempotency key PostHog keeps carries only its digest.
 */
export function authEmails(delivery: EmailDelivery) {
  const send =
    (template: EmailTemplate) =>
    ({ user, url, token }: AuthEmail) =>
      delivery.send({
        template,
        to: user.email,
        distinctId: user.id,
        data: { url },
        idempotencyKey: `${template}:${createHash('sha256').update(token).digest('hex')}`,
      })
  return { sendResetPassword: send('resetPassword'), sendVerificationEmail: send('verifyEmail') }
}
