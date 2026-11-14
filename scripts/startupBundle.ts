/**
 * Measures the JavaScript every page preloads: the root route's preloads in a production build's
 * TanStack Start manifest, which the server writes into every page as `modulepreload` links.
 *
 * `node scripts/startupBundle.ts <output>` prints the size of that set for a build's `.output`.
 * `node scripts/startupBundle.ts <output> <base output>` also reports the change from the base build,
 * in the step summary inside GitHub Actions, and fails when the set grows by more than GROWTH_LIMIT.
 * The limit is wide on purpose: ordinary growth only reports, and the failure catches a page
 * component or helper library pulled into the shell or a route file.
 */
import { appendFileSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'

const GROWTH_LIMIT = 50 * 1024

type Startup = { files: number; raw: number; gzip: number }

async function measure(output: string): Promise<Startup> {
  const server = path.join(output, 'server')
  const manifest = readdirSync(server, { recursive: true, encoding: 'utf8' }).find((file) =>
    path.basename(file).startsWith('_tanstack-start-manifest'),
  )
  if (!manifest) throw new Error(`${server} has no TanStack Start manifest; run the production build first`)
  const { tsrStartManifest } = await import(pathToFileURL(path.join(server, manifest)).href)
  const preloads: (string | { href: string })[] = tsrStartManifest().routes.__root__.preloads
  const startup = { files: preloads.length, raw: 0, gzip: 0 }
  for (const preload of preloads) {
    const source = readFileSync(path.join(output, 'public', typeof preload === 'string' ? preload : preload.href))
    startup.raw += source.length
    startup.gzip += gzipSync(source).length
  }
  return startup
}

const kb = (bytes: number) => `${Math.round(bytes / 1024).toLocaleString('en-US')} KB`
const signedKb = (bytes: number) => `${bytes > 0 ? '+' : bytes < 0 ? '−' : '±'}${kb(Math.abs(bytes))}`
const describe = (startup: Startup) => `${startup.files} files, ${kb(startup.gzip)} gzip (${kb(startup.raw)} raw)`

const [headOutput, baseOutput] = process.argv.slice(2)
if (!headOutput) throw new Error('usage: node scripts/startupBundle.ts <output> [<base output>]')
const head = await measure(headOutput)
if (!baseOutput) {
  console.log(`Every page preloads ${describe(head)}`)
} else {
  const base = await measure(baseOutput)
  const change = head.gzip - base.gzip
  const failed = change > GROWTH_LIMIT
  const message = `What every page preloads changed by ${signedKb(change)} gzip, to ${describe(head)}.`
  const summary = [
    '### Startup JavaScript',
    '',
    message,
    ...(failed ? [`This is more than the ${kb(GROWTH_LIMIT)} limit. Keep page code out of the shell and route files.`] : []),
    '',
    '| Build | Files | Raw | Gzip |',
    '| --- | --- | --- | --- |',
    `| Base | ${base.files} | ${kb(base.raw)} | ${kb(base.gzip)} |`,
    `| This change | ${head.files} | ${kb(head.raw)} | ${kb(head.gzip)} |`,
    '',
  ].join('\n')
  console.log(summary)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary)
  console.log(`::${failed ? 'error' : 'notice'} title=Startup JavaScript::${message}`)
  if (failed) process.exitCode = 1
}
