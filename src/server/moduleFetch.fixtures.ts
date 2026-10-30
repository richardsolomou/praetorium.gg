import { ConnectionId, Timestamp } from 'spacetimedb'
import { createModuleTestHarness, TestAuth, TestClock } from 'spacetimedb/server/test-utils'
import spacetime, * as module from '../../spacetimedb/src/index'

export const MODULE_URL = 'http://127.0.0.1:3999'
const URL_PREFIX = `${MODULE_URL}/v1/database/praetorium/call/`
const BIG_INTEGERS = new Set(['I64', 'U64', 'I128', 'U128', 'I256', 'U256'])

/**
 * The product module in memory, and a `fetch` that answers a `SpacetimeOperator`'s HTTP calls from it. The caller's test
 * file mocks `spacetime:sys@2.2` to read `env`, which this fills in.
 */
export function moduleFetch(env: Record<string, string>, issuer: string, now?: number) {
  const host = createModuleTestHarness(
    spacetime,
    module,
    now === undefined ? {} : { clock: new TestClock(new Timestamp(BigInt(now) * 1_000n)) },
  )
  const operator = TestAuth.fromJwtPayload(
    JSON.stringify({ iss: 'https://spacetime.test', sub: 'operator', aud: ['spacetimedb'] }),
    new ConnectionId(1n),
  )
  Object.assign(env, {
    AUTH_ISSUER: issuer,
    AUTH_AUDIENCE: 'praetorium',
    OPERATOR_IDENTITY: host.withReducerTx(operator, (ctx) => ctx.sender.toHexString()),
  })
  host.withReducerTx(TestAuth.internal(), (ctx) => module.init(ctx, {}))

  const exports = module as unknown as Record<string, (ctx: unknown, params: Record<string, unknown>) => unknown>
  const definitions = [
    ...spacetime.moduleDef.reducers.map(({ sourceName, params }) => ({ sourceName, params, reducer: true })),
    ...spacetime.moduleDef.procedures.map(({ sourceName, params }) => ({ sourceName, params, reducer: false })),
  ]
  const callable = new Map(definitions.map((definition) => [snake(definition.sourceName), definition]))
  const called = new Set<string>()
  const request = async (input: string | { href: string }, init: { body: string }) => {
    const url = typeof input === 'string' ? input : input.href
    const target = url.startsWith(URL_PREFIX) ? callable.get(url.slice(URL_PREFIX.length)) : undefined
    if (!target) throw new Error(`The server called ${url}, which this module does not have`)
    called.add(url.slice(URL_PREFIX.length))
    const values = JSON.parse(init.body) as unknown[]
    const params = Object.fromEntries(
      target.params.elements.map((element, index) => [element.name, argument(element.algebraicType, values[index])]),
    )
    const run = exports[target.sourceName]!
    try {
      if (target.reducer) {
        host.withReducerTx(operator, (ctx) => run(ctx, params))
        return new Response(null)
      }
      return Response.json(run(host.procedureContext(operator), params) ?? null)
    } catch (error) {
      return new Response(error instanceof Error ? error.message : String(error), { status: 530 })
    }
  }
  return { host, called, request: request as unknown as typeof fetch }
}

export const snake = (name: string) => name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)

/** Decodes an argument from the HTTP call's JSON into what the module function takes: an option arrives as `{ some }` or `{ none }`. */
function argument(type: { tag: string; value?: unknown }, value: unknown): unknown {
  if (BIG_INTEGERS.has(type.tag)) return BigInt(value as number)
  if (type.tag === 'Sum' && value && typeof value === 'object') {
    const { variants } = type.value as { variants: { name?: string; algebraicType: { tag: string; value?: unknown } }[] }
    const some = variants.find((variant) => variant.name === 'some')
    if ('some' in value) return some ? argument(some.algebraicType, value.some) : value.some
    if ('none' in value) return undefined
  }
  return value
}
