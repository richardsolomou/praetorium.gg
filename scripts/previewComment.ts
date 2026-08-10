import { reportPreviewStatus, type PreviewStatusState } from 'ras-stack/preview/github'

const requireEnvironment = (name: string) => {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

const state = process.argv[2] as PreviewStatusState
if (!['awaiting', 'building', 'ready', 'failed', 'deleted'].includes(state)) {
  throw new Error('Usage: previewComment.ts <awaiting|building|ready|failed|deleted>')
}
const repository = requireEnvironment('GITHUB_REPOSITORY')
const prNumber = requireEnvironment('PR_NUMBER')
const common = { repository, token: requireEnvironment('GH_TOKEN'), marker: '<!-- praetorium-preview -->' }
await reportPreviewStatus(
  {
    ...common,
    note: 'Sign in with `preview@praetorium.gg` / `preview-preview-preview`. Preview data is disposable and resets on every deployment.',
  },
  state === 'deleted'
    ? { state, prNumber }
    : {
        state,
        prNumber,
        sha: requireEnvironment('COMMIT_SHA'),
        previewUrl: `https://pr-${prNumber}.praetorium.gg`,
        runUrl: `${requireEnvironment('GITHUB_SERVER_URL')}/${repository}/actions/runs/${requireEnvironment('GITHUB_RUN_ID')}`,
      },
)
console.log(`Preview status set to ${state}`)
