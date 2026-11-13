import { callSpacetime, spacetimeDatabaseUrl, type SpacetimeConnection } from 'ras-stack/spacetime'
import { z } from 'zod'
import { withServerSpan } from '../../adapters/posthog'
import { offlineContext, SYNC_PRODUCT_ACTIONS } from '../offlineContext'

export const feedCursor = z.object({ at: z.number().int(), id: z.string() })
/** A nullable procedure argument as SpacetimeDB's option type. */
export const option = <T>(value: T | null) => (value === null ? { none: [] } : { some: value })

/** The connection every operation family sends its procedures and reducers through. */
export class SpacetimeClient {
  private readonly connection: SpacetimeConnection

  constructor(
    url: string,
    database: string,
    token: string,
    request: typeof fetch = fetch,
    access?: { clientId: string; clientSecret: string },
    internalHost?: string,
  ) {
    this.connection = {
      url,
      database,
      token,
      fetch: request,
      ...(access ? { headers: { 'CF-Access-Client-Id': access.clientId, 'CF-Access-Client-Secret': access.clientSecret } } : {}),
      ...(internalHost ? { internalHost } : {}),
    }
    spacetimeDatabaseUrl(this.connection)
    if (!token) throw new Error('SpacetimeDB operator token is required')
  }

  // Module results drop fields this build does not know, so a replica still on the previous build keeps
  // reading after a newer module appends a column or result field.
  /** A procedure returns its result as a JSON string. */
  protected async read<S extends z.ZodType>(name: string, arguments_: unknown[], schema: S): Promise<z.output<S>> {
    return schema.parse(JSON.parse(await this.reply(name, arguments_, z.string())))
  }

  protected async reply<S extends z.ZodType>(reducer: string, arguments_: unknown[], schema: S): Promise<z.output<S>> {
    return schema.parse(await (await this.call(reducer, arguments_)).json())
  }

  protected async call(reducer: string, arguments_: unknown[]): Promise<Response> {
    const context = offlineContext.getStore()
    if (context && SYNC_PRODUCT_ACTIONS.has(reducer)) {
      if (context.wrote) throw new Error('A saved action must commit in one transaction.')
      context.wrote = true
      const response = await this.call('sync_product', [
        JSON.stringify({
          id: context.id,
          owner: context.owner,
          fingerprint: context.fingerprint,
          createdAt: context.createdAt,
          name: reducer,
          args: arguments_,
          reportApplied: true,
        }),
      ])
      const result = z.object({ result: z.string(), applied: z.boolean() }).parse(JSON.parse(z.string().parse(await response.json())))
      context.applied = result.applied
      return new Response(result.result, { headers: { 'content-type': 'application/json' } })
    }
    return withServerSpan(`spacetime.${reducer}`, () => callSpacetime(this.connection, reducer, arguments_))
  }
}

/** A mixin's base must construct from any arguments; `SpacetimeOperator` keeps the client's own constructor. */
export type SpacetimeBase = new (...args: any[]) => SpacetimeClient
