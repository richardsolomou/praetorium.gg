import { readFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { z } from 'zod'
import { parseReleaseNotes } from '../src/core/releaseNotes'
import { privateR2Client } from '../src/server/r2Client'
import { isEntryPoint } from './lib/entryPoint'
import { requiredEnv } from './lib/requiredEnv'

const SUPPRESS_EMBEDS = 1 << 2
// Discord trims trailing whitespace; the invisible character preserves the final blank line.
const SPACER = '\n\n\u200b'
const snowflake = z.string().regex(/^\d{17,20}$/)
const receiptSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('pending'), revision: z.string() }),
  z.object({ status: z.literal('sent'), messageId: snowflake }),
])
type Store = { base: string; client: { fetch: (url: string, init?: RequestInit) => Promise<Response> } }
type Options = {
  revision: string
  version: string
  changelog: string
  webhook: string
  channelId: string
  request?: typeof fetch
  store?: Store | null
}

export function discordAnnouncement(changelog: string, version: string) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid release version')
  const release = parseReleaseNotes(changelog, Infinity).find((note) => note.version === version)
  if (!release) return null
  const link = new URL('https://praetorium.gg/whats-new')
  link.search = new URLSearchParams({
    utm_source: 'discord',
    utm_medium: 'community',
    utm_campaign: `release-${version.replaceAll('.', '-')}`,
  }).toString()
  link.hash = `release-${version}`
  const heading = `## 📜 Praetorium v${version} is live\n[Full update notes](${link.href}) · [GitHub release](https://github.com/richardsolomou/praetorium.gg/releases/tag/v${version})\n\n`
  const changes = [...release.features, ...release.fixes].map((change) => `- ${change}`).join('\n')
  const budget = 2000 - heading.length - SPACER.length
  const summary = changes.length <= budget ? changes : `${changes.slice(0, budget - 1).trimEnd()}…`
  return { content: `${heading}${summary}${SPACER}`, allowed_mentions: { parse: [] }, flags: SUPPRESS_EMBEDS }
}

export async function announceDiscord({
  revision,
  version,
  changelog,
  webhook,
  channelId,
  request = fetch,
  store = privateR2Client(),
}: Options) {
  const message = discordAnnouncement(changelog, version)
  if (!message) return console.log(`No player-facing notes for ${version}; nothing announced`)
  if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error('A full deployment revision is required')
  snowflake.parse(channelId)
  if (!URL.canParse(webhook)) throw new Error('Expected a Discord webhook URL')
  const endpoint = new URL(webhook)
  if (endpoint.origin !== 'https://discord.com' || !/^\/api(?:\/v10)?\/webhooks\/\d{17,20}\/[\w-]+$/.test(endpoint.pathname))
    throw new Error('Expected a Discord webhook URL')
  endpoint.search = ''
  endpoint.hash = ''
  if (!store) throw new Error('Private R2 storage is required for announcement receipts')
  const receiptUrl = `${store.base}discord-announcements/${channelId}/${version}.json`
  const stored = await store.client.fetch(receiptUrl, { signal: AbortSignal.timeout(30_000) })
  if (stored.ok) {
    const receipt = receiptSchema.parse(await stored.json())
    if (receipt.status === 'pending') throw new Error('Discord delivery is pending; inspect the channel before clearing the receipt')
    return console.log(`Discord already received ${version} (message ${receipt.messageId})`)
  }
  if (stored.status !== 404) throw new Error(`Reading the Discord receipt failed with HTTP ${stored.status}`)

  const health = await request('https://praetorium.gg/api/health', { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
  const live = await request('https://praetorium.gg/api/release', { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
  const liveRelease = live.ok ? z.object({ version: z.string() }).parse(await live.json()) : null
  if (!health.ok || health.headers.get('x-praetorium-revision') !== revision || liveRelease?.version !== version)
    throw new Error('Production is not serving the expected healthy release')

  // Fetch errors can contain the webhook token, so only expose a fixed operation name.
  const discordRequest = async (init?: RequestInit) => {
    try {
      return await request(endpoint, { ...init, signal: AbortSignal.timeout(30_000), redirect: 'error' })
    } catch {
      throw new Error('Discord request failed; inspect the channel before retrying delivery')
    }
  }
  const metadata = await discordRequest()
  if (!metadata.ok) throw new Error(`Reading the Discord webhook failed with HTTP ${metadata.status}`)
  if (z.object({ channel_id: snowflake }).parse(await metadata.json()).channel_id !== channelId)
    throw new Error('The Discord webhook belongs to another channel')

  // Claim before sending: an unknown HTTP outcome must never trigger a second post.
  const claim = await store.client.fetch(receiptUrl, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'if-none-match': '*' },
    body: JSON.stringify({ status: 'pending', revision }),
    signal: AbortSignal.timeout(30_000),
  })
  if (claim.status === 412) throw new Error('Another run already claimed this Discord announcement')
  if (!claim.ok) throw new Error(`Claiming the Discord announcement failed with HTTP ${claim.status}`)

  endpoint.searchParams.set('wait', 'true')
  const sent = await discordRequest({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(message) })
  if (!sent.ok) throw new Error(`Discord delivery failed with HTTP ${sent.status}; inspect the channel before clearing the receipt`)
  const delivered = z.object({ id: snowflake, channel_id: z.literal(channelId) }).parse(await sent.json())
  console.log(`Discord received ${version} (message ${delivered.id})`)
  // R2 permits one write per second to an object.
  await delay(1000)
  const saved = await store.client.fetch(receiptUrl, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'sent', messageId: delivered.id }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!saved.ok) throw new Error(`Saving the Discord receipt failed with HTTP ${saved.status}; the announcement was delivered`)
}

if (isEntryPoint(import.meta.url)) {
  const manifest = z.object({ version: z.string() }).parse(JSON.parse(await readFile('package.json', 'utf8')))
  await announceDiscord({
    version: manifest.version,
    changelog: await readFile('CHANGELOG.md', 'utf8'),
    revision: requiredEnv('DEPLOY_SHA'),
    webhook: requiredEnv('DISCORD_ANNOUNCEMENTS_WEBHOOK_URL'),
    channelId: requiredEnv('DISCORD_ANNOUNCEMENTS_CHANNEL_ID'),
  })
}
