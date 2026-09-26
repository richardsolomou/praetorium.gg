import type { drizzle } from 'drizzle-orm/d1'

type Binding = Parameters<typeof drizzle>[0]
type D1Value = string | number | boolean | null
type Statement = { sql: string; params: D1Value[] }
type Operation = 'run' | 'all' | 'raw' | 'first' | 'batch'
type Query = { operation: Operation; statements: Statement[]; columnNames?: boolean; columnName?: string }

const MAX_REQUEST_BYTES = 1_000_000
const MAX_STATEMENTS = 100

function statement(value: unknown): value is Statement {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<Statement>
  return (
    typeof candidate.sql === 'string' &&
    candidate.sql.length > 0 &&
    candidate.sql.length <= 100_000 &&
    Array.isArray(candidate.params) &&
    candidate.params.length <= 1_000 &&
    candidate.params.every(
      (param) =>
        param === null || typeof param === 'string' || typeof param === 'boolean' || (typeof param === 'number' && Number.isFinite(param)),
    )
  )
}

function query(value: unknown): value is Query {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<Query>
  return (
    ['run', 'all', 'raw', 'first', 'batch'].includes(candidate.operation ?? '') &&
    Array.isArray(candidate.statements) &&
    candidate.statements.length > 0 &&
    candidate.statements.length <= MAX_STATEMENTS &&
    candidate.statements.every(statement) &&
    (candidate.operation === 'batch' || candidate.statements.length === 1) &&
    (candidate.columnNames === undefined || typeof candidate.columnNames === 'boolean') &&
    (candidate.columnName === undefined || typeof candidate.columnName === 'string')
  )
}

/** Runs only inside the Worker outbound handler, which can access the bound D1 database. */
export async function handleD1Bridge(request: Request, database: Binding): Promise<Response> {
  if (request.method !== 'POST' || new URL(request.url).pathname !== '/query') return new Response(null, { status: 404 })
  if (Number(request.headers.get('content-length')) > MAX_REQUEST_BYTES) return new Response(null, { status: 413 })
  let body: string
  try {
    body = await request.text()
  } catch {
    return new Response(null, { status: 400 })
  }
  if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES) return new Response(null, { status: 413 })
  let input: unknown
  try {
    input = JSON.parse(body)
  } catch {
    return new Response(null, { status: 400 })
  }
  if (!query(input)) return new Response(null, { status: 400 })
  try {
    const statements = input.statements.map(({ sql, params }) => database.prepare(sql).bind(...params))
    const first = statements[0]!
    const result =
      input.operation === 'batch'
        ? await database.batch(statements)
        : input.operation === 'run'
          ? await first.run()
          : input.operation === 'all'
            ? await first.all()
            : input.operation === 'first'
              ? input.columnName
                ? await first.first(input.columnName)
                : await first.first()
              : input.columnNames
                ? await first.raw({ columnNames: true })
                : await first.raw()
    return Response.json({ result })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'D1 query failed' }, { status: 500 })
  }
}

class RemoteStatement {
  constructor(
    readonly sql: string,
    readonly params: D1Value[],
    private readonly send: (input: Query) => Promise<unknown>,
  ) {}

  bind(...params: unknown[]) {
    const candidate = { sql: this.sql, params }
    if (!statement(candidate)) throw new Error('Invalid D1 statement parameters')
    return new RemoteStatement(this.sql, candidate.params, this.send)
  }

  run() {
    return this.send({ operation: 'run', statements: [this] })
  }

  all() {
    return this.send({ operation: 'all', statements: [this] })
  }

  raw(options?: { columnNames?: boolean }) {
    return this.send({ operation: 'raw', statements: [this], columnNames: options?.columnNames })
  }

  first(columnName?: string) {
    return this.send({ operation: 'first', statements: [this], columnName })
  }
}

/** The Drizzle D1 adapter only needs prepared statements and batch for auth requests. */
export function remoteD1(endpoint = 'http://d1.internal/query', request: typeof fetch = fetch): Binding {
  const url = new URL(endpoint)
  if (url.protocol !== 'http:' || url.hostname !== 'd1.internal' || url.pathname !== '/query' || url.search || url.hash) {
    throw new Error('Invalid D1 bridge endpoint')
  }
  const send = async (input: Query) => {
    const response = await request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    })
    const output: unknown = await response.json()
    if (!output || typeof output !== 'object') throw new Error('Invalid D1 bridge response')
    const result = output as { result?: unknown; error?: unknown }
    if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : `D1 bridge failed with HTTP ${response.status}`)
    if (!('result' in result)) throw new Error('D1 bridge result is missing')
    return result.result
  }
  const adapter: unknown = {
    prepare: (sql: string) => new RemoteStatement(sql, [], send),
    batch: (statements: RemoteStatement[]) => {
      if (statements.some((entry) => !(entry instanceof RemoteStatement))) throw new Error('Invalid D1 batch statement')
      return send({ operation: 'batch', statements })
    },
  }
  return adapter as Binding
}
