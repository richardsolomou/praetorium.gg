// Deploys PR previews by driving the Dokploy API, so the environment can carry a
// Postgres URL that must not live in a public workflow file.
import fs from 'node:fs'
import { dokployPreviewFromEnvironment } from 'ras-stack/preview/dokploy'
import { loadPreviewAppSecrets, previewEnv, pullRequestNumber } from './previewEnv'

loadPreviewAppSecrets()

const prNumber = () => pullRequestNumber(process.env.PR_NUMBER)

async function deploy() {
  const { config, manager } = dokployPreviewFromEnvironment()
  const image = process.env.PREVIEW_IMAGE?.trim()
  if (!image) throw new Error('PREVIEW_IMAGE is required')
  const deployed = await manager.deploy({
    prNumber: prNumber(),
    image,
    environment: ({ url }) => previewEnv(prNumber(), url),
    ...(config.registry ? { registry: config.registry } : {}),
  })
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `preview-url=${deployed.url}\n`)
}

/*
 * Removing the application is all this can do.
 *
 * The preview Postgres is only reachable from inside Dokploy, so a closed pull
 * request leaves its empty database behind on an instance that holds nothing else.
 * The next deployment of that number drops it before use.
 */
async function remove() {
  const { manager } = dokployPreviewFromEnvironment()
  await manager.delete(prNumber())
}

async function prune() {
  const { manager } = dokployPreviewFromEnvironment()
  const open = new Set((process.env.OPEN_PR_NUMBERS ?? '').split(/\s+/).filter(Boolean).map(pullRequestNumber))
  await manager.prune(open)
}

const command = process.argv[2]
if (command === 'deploy') await deploy()
else if (command === 'delete') await remove()
else if (command === 'prune') await prune()
else {
  console.error('Usage: previewDeploy.ts <deploy|delete|prune>')
  process.exit(1)
}
