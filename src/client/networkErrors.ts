const FETCH_NETWORK_FAILURES = ['failed to fetch', 'networkerror when attempting to fetch resource', 'load failed', 'fetch failed']

const MODULE_LOAD_FAILURES = ['dynamically imported module', 'importing a module script failed']

function typeErrorMessage(error: unknown) {
  if (typeof error !== 'object' || error === null) return null
  const { name, message } = error as { name?: unknown; message?: unknown }
  return name === 'TypeError' && typeof message === 'string' ? message.toLowerCase() : null
}

/** A code-split chunk that failed to load, usually because a deploy replaced the build this page started with. */
export function isModuleLoadFailure(error: unknown): boolean {
  const message = typeErrorMessage(error)
  return message !== null && MODULE_LOAD_FAILURES.some((phrase) => message.includes(phrase))
}

/** Fetch rejects with these engine-specific TypeErrors when the connection drops or the page unloads mid-request. */
export function isFetchNetworkFailure(error: unknown): boolean {
  const message = typeErrorMessage(error)
  return message !== null && !isModuleLoadFailure(error) && FETCH_NETWORK_FAILURES.some((phrase) => message.includes(phrase))
}

/** What a player reads when a request lost its connection, in place of the engine's own wording. */
export const CONNECTION_LOST_MESSAGE = 'Your connection dropped. Try again when you are back online.'

/** A response the server answered with an error status, kept so failure reports can say which. */
export class HttpStatusError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

/** What a player reads when something other than Praetorium answered, such as a proxy during a deploy. */
export const SERVER_UNANSWERED_MESSAGE = "Praetorium didn't answer. Try again in a moment."

/**
 * Server functions answer in JSON or their own serialized frames, errors included; any other failed or untyped answer came
 * from something in front of the service, so its body (often an HTML error page) is never shown as a message.
 */
export async function serverFunctionFetch(input: RequestInfo | URL, init?: RequestInit, send: typeof fetch = fetch) {
  const response = await send(input, init)
  const type = response.headers.get('content-type')
  const fromService = response.headers.has('x-tss-serialized') || response.headers.get('x-tss-raw') === 'true' || type?.includes('json')
  if (fromService || (response.ok && type)) return response
  throw new HttpStatusError(SERVER_UNANSWERED_MESSAGE, response.status)
}
