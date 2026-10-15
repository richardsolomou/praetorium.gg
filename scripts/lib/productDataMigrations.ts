import { z } from 'zod'
import { spacetimeSqlEndpoint } from './spacetimeSqlEndpoint.ts'

const tables = ['rosters', 'collection', 'journal_games', 'journal_events'] as const
type Source = {
  url: string
  database: string
  ownerToken: string
  operatorToken: string
  accessClientId?: string
  accessClientSecret?: string
}

async function responseJson(response: Response) {
  if (!response.body) throw new Error('Missing product migration response')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > 32_000_000) throw new Error('Product migration response exceeds 32 MB')
      chunks.push(value)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } finally {
    await reader.cancel()
    reader.releaseLock()
  }
}

export async function migrateProductData(source: Source, request: typeof fetch = fetch) {
  const endpoint = spacetimeSqlEndpoint(source.url, source.database)
  if (!source.ownerToken || !source.operatorToken) throw new Error('Product migration needs owner and operator credentials')
  if (Boolean(source.accessClientId) !== Boolean(source.accessClientSecret)) throw new Error('Supply both Cloudflare Access credentials')
  const access: Record<string, string> = source.accessClientId
    ? { 'CF-Access-Client-Id': source.accessClientId, 'CF-Access-Client-Secret': source.accessClientSecret! }
    : {}
  const signal = AbortSignal.timeout(600_000)
  const send = async (url: URL, body: string, token: string, contentType: string) => {
    const response = await request(url, {
      method: 'POST',
      redirect: 'error',
      headers: { ...access, authorization: `Bearer ${token}`, 'content-type': contentType },
      body,
      signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
    })
    if (!response.ok) throw new Error(`Product migration failed with HTTP ${response.status}`)
    return responseJson(response)
  }
  const inventory: { table: (typeof tables)[number]; keys: string[] }[] = []
  for (const table of tables) {
    const column = table === 'collection' ? 'key' : 'id'
    const [result] = z
      .array(z.object({ rows: z.array(z.tuple([z.string().min(1).max(512)])).max(100_000) }))
      .length(1)
      .parse(await send(endpoint, `SELECT ${column} FROM ${table}`, source.ownerToken, 'text/plain'))
    inventory.push({ table, keys: result!.rows.map(([key]) => key) })
  }
  const totals = { rosters: 0, collection: 0, journal_games: 0, journal_events: 0 }
  for (const { table, keys } of inventory) {
    for (let offset = 0; offset < keys.length; offset += 20) {
      const raw = await send(
        new URL(`/v1/database/${source.database}/call/migrate_product_data`, endpoint),
        JSON.stringify([table, keys.slice(offset, offset + 20)]),
        source.operatorToken,
        'application/json',
      )
      const result = z.object({ changed: z.number().int().min(0).max(20) }).parse(JSON.parse(z.string().parse(raw)))
      totals[table] += result.changed
    }
  }
  return totals
}
