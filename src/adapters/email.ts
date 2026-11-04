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
  const key = environment.POSTHOG_EMAIL_API_KEY
  const host = environment.POSTHOG_HOST
  if (!key || !host) return undefined
  const url = new URL('/api/projects/@current/messaging/send/email/', host)

  return {
    async send({ template, to, distinctId, data, idempotencyKey }) {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        body: JSON.stringify({ template_id: EMAIL_TEMPLATES[template], to, distinct_id: distinctId, message_data: data }),
        signal: AbortSignal.timeout(15_000),
      })
      if (response.status === 202) return
      const { code } = (await response.json().catch(() => ({}))) as { code?: string }
      throw new Error(`PostHog email answered ${response.status}${code ? ` ${code}` : ''}`)
    },
  }
}
