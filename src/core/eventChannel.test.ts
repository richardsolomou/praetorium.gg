import { describe, expect, it } from 'vitest'
import { discordWebhookSchema, eventChannelMessage } from './eventChannel'

const ID = '1'.repeat(18)
const TOKEN = 't'.repeat(68)

describe('discordWebhookSchema', () => {
  it('saves an older or test-client link as the discord.com address', () => {
    expect(discordWebhookSchema.parse(`https://canary.discordapp.com/api/v10/webhooks/${ID}/${TOKEN}`)).toBe(
      `https://discord.com/api/webhooks/${ID}/${TOKEN}`,
    )
  })

  it('refuses a link to any host but Discord, which the server would post to', () => {
    expect(discordWebhookSchema.safeParse(`https://discord.com.example.net/api/webhooks/${ID}/${TOKEN}`).success).toBe(false)
  })
})

describe('eventChannelMessage', () => {
  it('posts a player’s name as text, never a mention or a link', () => {
    const content = eventChannelMessage({
      kind: 'result',
      name: 'Group',
      league: true,
      sides: [
        { names: ['@everyone'], score: 80 },
        { names: ['[Prize](https://example.net)'], score: 60 },
      ],
      link: 'https://praetorium.gg/battles/b',
    })
    expect(content.split('\n')[0]).toBe('**Group** league: \\@everyone 80 – \\[Prize\\]\\(https:\u200b//example.net\\) 60')
  })

  it('keeps the link when a long round is cut short', () => {
    const name = 'N'.repeat(48)
    const content = eventChannelMessage({
      kind: 'paired',
      name: 'T'.repeat(100),
      round: 2,
      tables: Array.from({ length: 16 }, (_, index) => ({ table: index + 1, a: name, b: name })),
      standings: Array.from({ length: 8 }, () => ({ name, points: 3, won: 1, drawn: 0, lost: 0 })),
      link: `https://praetorium.gg/tournaments/${'x'.repeat(64)}`,
    })
    expect([content.length <= 2000, content.endsWith(`[See your table](https://praetorium.gg/tournaments/${'x'.repeat(64)})`)]).toEqual([
      true,
      true,
    ])
  })
})
