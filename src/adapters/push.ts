/**
 * Delivery through Expo's push service, which fronts APNs and FCM for the shipped app.
 *
 * Nothing here throws into its caller: a notice is a courtesy, and a push
 * service that is slow or down must not fail or delay the write that caused it.
 */
export type PushMessage = { to: string; title: string; body: string; path: string }

export type PushSender = { send: (messages: readonly PushMessage[]) => Promise<void> }

type PushSenderOptions = {
  accessToken: string
  /** Called with devices the service says no longer exist, so they stop being sent to. */
  onUnregistered: (tokens: string[]) => Promise<void> | void
  fetch?: typeof fetch
  sleep?: (milliseconds: number) => Promise<void>
  /** Runs the receipt check later; receipts are ready within minutes and kept for a day. */
  later?: (work: () => void, milliseconds: number) => void
  log?: (message: string, detail: Record<string, unknown>) => void
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

type Outcome = { status?: unknown; id?: unknown; details?: { error?: unknown } }

export function pushSenderFromEnvironment(
  onUnregistered: PushSenderOptions['onUnregistered'],
  environment: NodeJS.ProcessEnv = process.env,
): PushSender | null {
  const accessToken = environment.EXPO_PUSH_ACCESS_TOKEN?.trim()
  return accessToken ? expoPushSender({ accessToken, onUnregistered }) : null
}

export function expoPushSender(options: PushSenderOptions): PushSender {
  const request = options.fetch ?? fetch
  const sleep = options.sleep ?? ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)))
  const later = options.later ?? ((work, milliseconds) => setTimeout(work, milliseconds).unref())
  const log = options.log ?? ((message, detail) => console.warn(message, detail))

  /** The parsed body of a successful response, or null once retrying stops helping. */
  async function post(url: string, body: unknown): Promise<unknown> {
    for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
      let retryable = true
      try {
        const response = await request(url, {
          method: 'POST',
          headers: { accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${options.accessToken}` },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
        if (response.ok) return await response.json()
        retryable = response.status === 429 || response.status >= 500
        log('push request refused', { status: response.status, attempt })
      } catch (error) {
        log('push request failed', { error, attempt })
      }
      if (!retryable || attempt === ATTEMPTS) return null
      await sleep(RETRY_BASE_MS * 2 ** (attempt - 1))
    }
    return null
  }

  async function forget(tokens: string[]) {
    if (!tokens.length) return
    try {
      await options.onUnregistered(tokens)
    } catch (error) {
      log('push token cleanup failed', { error })
    }
  }

  async function checkReceipts(tickets: Map<string, string>) {
    const ids = [...tickets.keys()]
    const gone: string[] = []
    for (let start = 0; start < ids.length; start += RECEIPTS_PER_REQUEST) {
      const answer = (await post(RECEIPTS_URL, { ids: ids.slice(start, start + RECEIPTS_PER_REQUEST) })) as {
        data?: Record<string, Outcome>
      } | null
      for (const [id, receipt] of Object.entries(answer?.data ?? {})) {
        const token = tickets.get(id)
        if (token && receipt.status === 'error' && receipt.details?.error === 'DeviceNotRegistered') gone.push(token)
      }
    }
    await forget(gone)
  }

  return {
    async send(messages) {
      const gone: string[] = []
      const tickets = new Map<string, string>()
      for (let start = 0; start < messages.length; start += MESSAGES_PER_REQUEST) {
        const chunk = messages.slice(start, start + MESSAGES_PER_REQUEST)
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
        })
      }
      await forget(gone)
      if (tickets.size) later(() => void checkReceipts(tickets), RECEIPT_DELAY_MS)
    },
  }
}
