import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { announceDiscord, discordAnnouncement } from './announceDiscord'

const revision = 'a'.repeat(40)
const version = '1.2.3'
const channelId = '123456789012345678'
const webhook = 'https://discord.com/api/webhooks/123456789012345679/test-token'
const changelog =
  '# praetorium\n\n## 1.2.3\n\n### Patch Changes\n\n- abc1234: Saved armies keep their custom names.\n\n## 1.2.2\n\n- An older change.'

function services({ liveRevision = revision, liveVersion = version, healthStatus = 200, discordStatus = 200, failReceipt = false } = {}) {
  let receipt: string | undefined
  const messages: unknown[] = []
  const request = async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString())
    if (url.pathname === '/api/health')
      return new Response(null, { status: healthStatus, headers: { 'x-praetorium-revision': liveRevision } })
    if (url.pathname === '/api/release') return Response.json({ version: liveVersion })
    if (url.host === 'store.test') {
      if (init?.method === 'PUT') {
        if (new Headers(init.headers).get('if-none-match') === '*' && receipt) return new Response(null, { status: 412 })
        if (failReceipt && receipt) return new Response(null, { status: 503 })
        if (typeof init.body !== 'string') throw new Error('Expected a JSON receipt')
        receipt = init.body
        return new Response(null)
      }
      return receipt ? new Response(receipt) : new Response(null, { status: 404 })
    }
    if (url.host === 'discord.com' && init?.method === 'POST') {
      if (typeof init.body !== 'string') throw new Error('Expected a JSON message')
      messages.push(JSON.parse(init.body))
      return discordStatus === 200
        ? Response.json({ id: '123456789012345680', channel_id: channelId })
        : new Response(null, { status: discordStatus })
    }
    if (url.host === 'discord.com') return Response.json({ channel_id: channelId })
    throw new Error(`Unexpected request to ${url.host}${url.pathname}`)
  }
  return {
    messages,
    options: {
      revision,
      version,
      channelId,
      webhook,
      changelog,
      request,
      store: { base: 'https://store.test/', client: { fetch: request } },
    },
  }
}

it('uses only this version’s player-facing notes', () => {
  expect(discordAnnouncement(changelog, version)).toEqual({
    content:
      '## 📜 Praetorium v1.2.3 is live\n[Full update notes](https://praetorium.gg/whats-new?utm_source=discord&utm_medium=community&utm_campaign=release-1-2-3#release-1.2.3) · [GitHub release](https://github.com/richardsolomou/praetorium.gg/releases/tag/v1.2.3)\n\n- Saved armies keep their custom names.\n\n\u200b',
    allowed_mentions: { parse: [] },
    flags: 4,
  })
})

it('does not fall back to older notes for a technical-only version', () => {
  expect(discordAnnouncement(changelog, '1.2.4')).toBeNull()
})

it('keeps long announcements within Discord’s limit and retains the full-notes link', () => {
  const message = discordAnnouncement(`## 1.2.3\n\n- ${'A'.repeat(3000)}`, version)!
  expect({
    fits: message.content.length <= 2000,
    hasNotesLink: message.content.includes('#release-1.2.3)'),
    hasReleaseLink: message.content.includes('/releases/tag/v1.2.3)'),
    ending: message.content.slice(-4),
  }).toEqual({
    fits: true,
    hasNotesLink: true,
    hasReleaseLink: true,
    ending: '…\n\n\u200b',
  })
})

it('posts the player summary once across retries', async () => {
  const { options, messages } = services()
  await announceDiscord(options)
  await announceDiscord(options)
  expect(messages).toEqual([discordAnnouncement(changelog, version)])
})

it.each([{ liveRevision: 'b'.repeat(40) }, { liveVersion: '1.2.2' }, { healthStatus: 503 }])(
  'does not post before the expected release is healthy: %j',
  async (overrides) => {
    const { options, messages } = services(overrides)
    const failure = await announceDiscord(options).catch((error: Error) => error.message)
    expect({ failure, messages }).toEqual({ failure: 'Production is not serving the expected healthy release', messages: [] })
  },
)

it('does not post to another channel', async () => {
  const { options, messages } = services()
  const failure = await announceDiscord({ ...options, channelId: '123456789012345681' }).catch((error: Error) => error.message)
  expect({ failure, messages }).toEqual({ failure: 'The Discord webhook belongs to another channel', messages: [] })
})

it('does not resend after an ambiguous Discord failure', async () => {
  const { options, messages } = services({ discordStatus: 502 })
  const first = await announceDiscord(options).catch((error: Error) => error.message)
  const failure = await announceDiscord(options).catch((error: Error) => error.message)
  expect({ first, failure, count: messages.length }).toEqual({
    first: 'Discord delivery failed with HTTP 502; inspect the channel before clearing the receipt',
    failure: 'Discord delivery is pending; inspect the channel before clearing the receipt',
    count: 1,
  })
})

it('does not resend when saving a delivered message fails', async () => {
  const { options, messages } = services({ failReceipt: true })
  const first = await announceDiscord(options).catch((error: Error) => error.message)
  const failure = await announceDiscord(options).catch((error: Error) => error.message)
  expect({ first, failure, count: messages.length }).toEqual({
    first: 'Saving the Discord receipt failed with HTTP 503; the announcement was delivered',
    failure: 'Discord delivery is pending; inspect the channel before clearing the receipt',
    count: 1,
  })
})

it('allows only one concurrent sender to claim a version', async () => {
  const { options, messages } = services()
  await Promise.allSettled([announceDiscord(options), announceDiscord(options)])
  expect(messages).toHaveLength(1)
})

it('runs announcements only for a release after production deployment succeeds', () => {
  const workflow = parse(readFileSync('.github/workflows/release.yml', 'utf8'))
  const job = workflow.jobs['announce-discord']
  expect({ needs: job.needs, condition: job.if }).toEqual({
    needs: ['release', 'dokploy-production'],
    condition: "needs.release.outputs.created == 'true'",
  })
})
