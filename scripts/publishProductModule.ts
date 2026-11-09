import { readFile } from 'node:fs/promises'
import pRetry from 'p-retry'
import { publishSpacetimeModule } from 'ras-stack/spacetime'
import { isEntryPoint } from './lib/entryPoint.ts'
import { requiredEnv } from './lib/requiredEnv'

/**
 * Repeats the whole plan and publish when the request never got an answer, as when the upload stalls in the tunnel.
 * Planning again accounts for a publish that did land, and a migration the server refuses is not asked twice.
 */
export function publishRetryingStalls(publish: () => Promise<void>, retryMs = 5_000) {
  return pRetry(publish, {
    retries: 2,
    minTimeout: retryMs,
    shouldRetry: ({ error }) => error.name === 'TimeoutError' || error instanceof TypeError,
  })
}

if (isEntryPoint(import.meta.url)) {
  const [file, target] = process.argv.slice(2)
  if (process.argv.length !== 4 || !file || (target !== 'production' && target !== 'staging'))
    throw new Error('Usage: publishProductModule.ts <bundle.js> production|staging')
  const bundle = await readFile(file)
  // The module environment was declared on first publish and SpacetimeDB keeps it, so updates send none.
  await publishRetryingStalls(() =>
    publishSpacetimeModule(
      {
        url: requiredEnv('SPACETIME_URL'),
        database: `praetorium-${target}`,
        token: requiredEnv('SPACETIME_OWNER_TOKEN'),
        headers: {
          'CF-Access-Client-Id': requiredEnv('SPACETIME_ACCESS_CLIENT_ID'),
          'CF-Access-Client-Secret': requiredEnv('SPACETIME_ACCESS_CLIENT_SECRET'),
        },
      },
      bundle,
      { breakClients: true },
    ),
  )
  console.log(`Published the product module to praetorium-${target}`)
}
