/**
 * Delivery through Expo's push service, which fronts APNs and FCM for the shipped app.
 *
 * Nothing here throws into its caller: a notice is a courtesy, and a push
 * service that is slow or down must not fail or delay the write that caused it.
 */
import pRetry from 'p-retry'
import { chunks } from '../core/collections'
import { countServerMetric, reportServerFailure, requestOutcome } from './posthog'

export type PushMessage = { to: string; title: string; body: string; path: string }

export type PushSender = { send: (messages: readonly PushMessage[]) => Promise<void> }

type PushSenderOptions = {
  accessToken: string
  /** Called with devices the service says no longer exist, so they stop being sent to. */
  onUnregistered: (tokens: string[]) => Promise<void> | void
  fetch?: typeof fetch
  /** Runs the receipt check later; receipts are ready within minutes and kept for a day. */
  later?: (work: () => void, milliseconds: number) => void
  log?: (event: string, detail: Record<string, unknown>) => void
}

const SEND_URL = 'https://exp.host/--/api/v2/push/send'
const RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts'
const MESSAGES_PER_REQUEST = 100
const RECEIPTS_PER_REQUEST = 1_000
const REQUEST_TIMEOUT_MS = 10_000
const ATTEMPTS = 3
const RETRY_BASE_MS = 1_000
const RECEIPT_DELAY_MS = 15 * 60_000
/** How long an offline device is still worth reaching: a day-old notice has usually been acted on elsewhere. */
const TTL_SECONDS = 24 * 60 * 60

class RefusedRequest extends Error {
  constructor(readonly retryable: boolean) {
    super('push request refused')
  }
}

type Outcome = { status?: unknown; id?: unknown; details?: { error?: unknown } }

function errorCode(outcome: Outcome) {
  const code = outcome.details?.error
  return typeof code === 'string' && /^[A-Za-z]{1,64}$/.test(code) ? code : 'unknown'
}

export function pushSenderFromEnvironment(
  onUnregistered: PushSenderOptions['onUnregistered'],
  environment: NodeJS.ProcessEnv = process.env,
): PushSender | null {
  const accessToken = environment.EXPO_PUSH_ACCESS_TOKEN?.trim()
  return accessToken ? expoPushSender({ accessToken, onUnregistered }) : null
}

export function expoPushSender(options: PushSenderOptions): PushSender {
  const request = options.fetch ?? fetch
  const later = options.later ?? ((work, milliseconds) => setTimeout(work, milliseconds).unref())
  const log = options.log ?? ((event, detail) => reportServerFailure({ event, ...detail }, 'warn'))

  /** The parsed body of a successful response, or null once retrying stops helping. */
  async function post(url: string, body: unknown): Promise<unknown> {
    return pRetry(
      async (attempt) => {
        let response: Response
        try {
          response = await request(url, {
            method: 'POST',
            headers: { accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${options.accessToken}` },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          })
          countServerMetric('push.requests', requestOutcome(response.status))
          if (response.ok) return (await response.json()) as unknown
        } catch (error) {
          countServerMetric('push.requests', requestOutcome())
          log('push_request_failed', { error, attempt })
          throw error
        }
        log('push_request_refused', { status: response.status, attempt })
        throw new RefusedRequest(response.status === 429 || response.status >= 500)
      },
      {
        retries: ATTEMPTS - 1,
        minTimeout: RETRY_BASE_MS,
        factor: 2,
        shouldRetry: ({ error }) => !(error instanceof RefusedRequest) || error.retryable,
      },
    ).catch(() => null)
  }

  async function forget(tokens: string[]) {
    if (!tokens.length) return
    try {
      await options.onUnregistered(tokens)
    } catch (error) {
      log('push_token_cleanup_failed', { error })
    }
  }

  async function checkReceipts(tickets: Map<string, string>) {
    const ids = [...tickets.keys()]
    const gone: string[] = []
    for (const batch of chunks(ids, RECEIPTS_PER_REQUEST)) {
      const answer = (await post(RECEIPTS_URL, { ids: batch })) as {
        data?: Record<string, Outcome>
      } | null
      for (const [id, receipt] of Object.entries(answer?.data ?? {})) {
        const token = tickets.get(id)
        if (token && receipt.status === 'error' && receipt.details?.error === 'DeviceNotRegistered') gone.push(token)
        else if (token && receipt.status === 'error') log('push_receipt_failed', { error: errorCode(receipt) })
      }
    }
    await forget(gone)
  }

  return {
    async send(messages) {
      const gone: string[] = []
      const tickets = new Map<string, string>()
      for (const chunk of chunks(messages, MESSAGES_PER_REQUEST)) {
        const answer = (await post(
          SEND_URL,
          chunk.map((message) => ({
            to: message.to,
            title: message.title,
            body: message.body,
            data: { path: message.path },
            sound: 'default',
            ttl: TTL_SECONDS,
            channelId: 'default',
          })),
        )) as { data?: Outcome[] } | null
        answer?.data?.forEach((ticket, index) => {
          const token = chunk[index]?.to
          if (!token) return
          if (ticket.status === 'ok' && typeof ticket.id === 'string') tickets.set(ticket.id, token)
          else if (ticket.details?.error === 'DeviceNotRegistered') gone.push(token)
          else if (ticket.status === 'error') log('push_ticket_failed', { error: errorCode(ticket) })
        })
      }
      await forget(gone)
      if (tickets.size) later(() => void checkReceipts(tickets), RECEIPT_DELAY_MS)
    },
  }
}
