import fs from 'node:fs'
import { DokployClient, DokployPreviewManager, pullRequestNumber } from 'ras-stack/preview/dokploy'

const requireEnvironment = (name: string) => {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

const client = new DokployClient({
  url: requireEnvironment('DOKPLOY_URL'),
  apiKey: requireEnvironment('DOKPLOY_API_KEY'),
  environmentId: requireEnvironment('DOKPLOY_ENVIRONMENT_ID'),
})
const manager = new DokployPreviewManager({
  client,
  applicationName: (prNumber) => `praetorium-pr-${prNumber}`,
  hostname: (prNumber) => `pr-${prNumber}.praetorium.gg`,
  port: 3000,
})

const command = process.argv[2]
if (command === 'deploy') {
  const prNumber = pullRequestNumber(requireEnvironment('PR_NUMBER'))
  const username = process.env.PREVIEW_REGISTRY_USERNAME?.trim()
  const password = process.env.PREVIEW_REGISTRY_PASSWORD?.trim()
  if (Boolean(username) !== Boolean(password)) throw new Error('preview registry username and password must be configured together')
  const preview = await manager.deploy({
    prNumber,
    image: requireEnvironment('PREVIEW_IMAGE'),
    environment: `APP_URL=https://pr-${prNumber}.praetorium.gg\nPRAETORIUM_SEED_PREVIEW=true\n`,
    ...(username && password ? { registry: { username, password } } : {}),
  })
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `preview-url=${preview.url}\n`)
} else if (command === 'delete') {
  const prNumber = pullRequestNumber(requireEnvironment('PR_NUMBER'))
  console.log((await manager.delete(prNumber)) ? `Deleted praetorium-pr-${prNumber}` : `No preview for pr-${prNumber}`)
} else if (command === 'prune') {
  const open = new Set((process.env.OPEN_PR_NUMBERS ?? '').split(/\s+/).filter(Boolean).map(pullRequestNumber))
  for (const prNumber of await manager.prune(open)) console.log(`Deleted praetorium-pr-${prNumber}`)
} else {
  console.error('Usage: previewDeploy.ts <deploy|delete|prune>')
  process.exitCode = 2
}
