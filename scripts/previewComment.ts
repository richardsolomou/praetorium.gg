/**
 * One comment per pull request, rewritten as its preview changes state.
 *
 * One comment rather than one per deploy: the question being asked is "what is at
 * that URL right now", and a thread of eleven answers does not answer it.
 */
import process from 'node:process'

const PREVIEW_DOMAIN = 'praetorium.gg'
const MARKER = '<!-- praetorium-preview -->'
const NOTE = 'Sign in with `preview@praetorium.gg` / `preview-preview-preview`. Preview data is disposable and resets on every deployment.'

type State = 'awaiting' | 'building' | 'ready' | 'failed' | 'deleted'

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function requirePrNumber(): string {
  const value = requireEnv('PR_NUMBER')
  if (!/^\d+$/.test(value)) throw new Error('PR_NUMBER must be a pull request number')
  return value
}

async function github<T = unknown>(path: string, init?: { method: string; body: unknown }): Promise<T> {
  const baseUrl = process.env.GITHUB_API_URL?.trim() || 'https://api.github.com'
  const response = await fetch(`${baseUrl}${path}`, {
    method: init?.method,
    headers: {
      authorization: `Bearer ${requireEnv('GH_TOKEN')}`,
      accept: 'application/vnd.github+json',
      ...(init && { 'content-type': 'application/json' }),
    },
    body: init === undefined ? undefined : JSON.stringify(init.body),
  })
  if (!response.ok) throw new Error(`${path} failed with ${response.status}: ${await response.text()}`)
  return (await response.json()) as T
}

/** What is still up while a new version builds, taken from the comment being replaced. */
function standing(previousBody?: string): string {
  const previousSha = previousBody?.match(/up to date with commit `([0-9a-f]{7})`/)?.[1]
  return previousSha ? ` The preview of \`${previousSha}\` stays up until it does.` : ''
}

function commentBody(state: State, prNumber: string, previousBody?: string): string {
  if (state === 'deleted') return `${MARKER}\n🗑️ Preview deleted, because this pull request is closed.`
  const sha = requireEnv('COMMIT_SHA').slice(0, 7)
  const headings: Record<Exclude<State, 'deleted'>, string> = {
    awaiting: `⏸️ The preview of \`${sha}\` is waiting for a maintainer to approve its build.${standing(previousBody)}`,
    building: `🔄 Deploying \`${sha}\`.${standing(previousBody)}`,
    ready: `✅ Preview is up to date with commit \`${sha}\`.`,
    failed: `❌ Deploying \`${sha}\` failed ([workflow run](${requireEnv('GITHUB_SERVER_URL')}/${requireEnv('GITHUB_REPOSITORY')}/actions/runs/${requireEnv('GITHUB_RUN_ID')})) — whatever is below may be stale or gone.`,
  }
  return `${MARKER}\n${headings[state]}\n\nPreview: https://pr-${prNumber}.${PREVIEW_DOMAIN}\n\n${NOTE}`
}

/** The same states as a commit check, so the pull request's own list says where the preview is. */
const CHECKS: Record<State, { status: string; conclusion?: string; summary: string } | null> = {
  awaiting: { status: 'queued', summary: 'The preview build is waiting for workflow approval.' },
  building: { status: 'in_progress', summary: 'A new preview version is deploying.' },
  ready: { status: 'completed', conclusion: 'success', summary: 'The preview is up to date.' },
  failed: { status: 'completed', conclusion: 'failure', summary: 'The preview deployment failed.' },
  // A closed pull request has nothing left to report against.
  deleted: null,
}

const state = process.argv[2] as State
if (!['awaiting', 'building', 'ready', 'failed', 'deleted'].includes(state)) {
  console.error('Usage: previewComment.ts <awaiting|building|ready|failed|deleted>')
  process.exit(1)
}

const repository = requireEnv('GITHUB_REPOSITORY')
const prNumber = requirePrNumber()

const check = CHECKS[state]
if (check) {
  const sha = requireEnv('COMMIT_SHA')
  const name = 'PR preview deploy'
  const checks = await github<{ check_runs: { id: number }[] }>(
    `/repos/${repository}/commits/${sha}/check-runs?check_name=${encodeURIComponent(name)}&filter=latest`,
  )
  const body = {
    status: check.status,
    ...(check.conclusion && { conclusion: check.conclusion }),
    details_url: `${requireEnv('GITHUB_SERVER_URL')}/${repository}/actions/runs/${requireEnv('GITHUB_RUN_ID')}`,
    output: { title: name, summary: check.summary },
  }
  const existing = checks.check_runs[0]
  if (existing) await github(`/repos/${repository}/check-runs/${existing.id}`, { method: 'PATCH', body })
  else await github(`/repos/${repository}/check-runs`, { method: 'POST', body: { ...body, name, head_sha: sha } })
}

let existingId: number | undefined
let existingBody: string | undefined
for (let page = 1; page <= 10 && existingId === undefined; page++) {
  const comments = await github<{ id: number; body?: string }[]>(
    `/repos/${repository}/issues/${prNumber}/comments?per_page=100&page=${page}`,
  )
  const existing = comments.find((comment) => comment.body?.includes(MARKER))
  existingId = existing?.id
  existingBody = existing?.body
  if (comments.length < 100) break
}

const body = commentBody(state, prNumber, existingBody)
if (existingId === undefined) await github(`/repos/${repository}/issues/${prNumber}/comments`, { method: 'POST', body: { body } })
else await github(`/repos/${repository}/issues/comments/${existingId}`, { method: 'PATCH', body: { body } })
console.log(`Preview comment set to ${state}`)
