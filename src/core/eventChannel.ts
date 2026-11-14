import { z } from 'zod'

/** Matched as text because the SpacetimeDB module, which imports this file, has no `URL`. */
const DISCORD_WEBHOOK =
  /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api(?:\/v\d{1,2})?\/webhooks\/(\d{17,20})\/([\w-]{60,100})\/?$/

/** Where a group or tournament posts its updates, as Discord's channel settings copy it. */
export const discordWebhookSchema = z
  .string()
  .trim()
  .max(256)
  .transform((text, context) => {
    const match = DISCORD_WEBHOOK.exec(text)
    if (match) return `https://discord.com/api/webhooks/${match[1]}/${match[2]}`
    context.addIssue({ code: 'custom', message: 'Paste a webhook link from your Discord channel’s settings' })
    return z.NEVER
  })

/** Discord's own limit on a webhook's name. */
export const EVENT_CHANNEL_NAME_MAX_LENGTH = 80

/** Posts that fail in a row before the channel stops; Discord refusing the address stops it at once. */
export const EVENT_CHANNEL_FAILURES_MAX = 5

/** Discord's limit on one message. */
const MESSAGE_MAX = 2000
/** Tables or standings a post lists before it counts the rest, so it stays a glance. */
const LISTED_MAX = 16
const STANDINGS_MAX = 8

type Side = { names: readonly string[]; score: number }

/** One update a channel posts, with the names its readers would see on the page it links to. */
export type EventChannelUpdate =
  | { kind: 'revealed'; name: string; link: string }
  | {
      kind: 'paired'
      name: string
      round: number
      tables: readonly { table: number; a: string; b: string | null }[]
      standings: readonly { name: string; points: number; won: number; drawn: number; lost: number }[]
      link: string
    }
  | { kind: 'deadline'; name: string; round: number; link: string }
  | { kind: 'result'; name: string; league: boolean; sides: readonly Side[]; link: string }

/** Names come from players, so Discord must read them as text rather than formatting or links; a zero-width space breaks a bare address. */
const plain = (text: string) => text.replace(/[\\*_~`|>#[\]()<@]/g, '\\$&').replaceAll('://', ':\u200b//')

const counted = (lines: readonly string[], noun: string) =>
  lines.length > LISTED_MAX ? [...lines.slice(0, LISTED_MAX), `and ${lines.length - LISTED_MAX} more ${noun}`] : [...lines]

/** A short message for the channel, with a link back to the page that has the rest. */
export function eventChannelMessage(update: EventChannelUpdate) {
  const title = `**${plain(update.name)}**`
  const lines = (() => {
    switch (update.kind) {
      case 'revealed':
        return [`${title}: the lists are out, so battles can start.`, `[See the lists](${update.link})`]
      case 'paired': {
        const tables = update.tables.map((table) =>
          table.b === null ? `Bye: ${plain(table.a)}` : `Table ${table.table}: ${plain(table.a)} v ${plain(table.b)}`,
        )
        const standings = update.standings
          .slice(0, STANDINGS_MAX)
          .map((row, index) => `${index + 1}. ${plain(row.name)}, ${row.points} pts (${row.won}–${row.drawn}–${row.lost})`)
        return [
          `${title}: round ${update.round} is paired.`,
          ...counted(tables, 'tables'),
          ...(standings.length ? ['', `Standings after round ${update.round - 1}:`, ...standings] : []),
          `[See your table](${update.link})`,
        ]
      }
      case 'deadline':
        return [
          `${title}: round ${update.round} of the league ends soon. Finish your games before the deadline.`,
          `[See the league](${update.link})`,
        ]
      case 'result': {
        const score = update.sides.map((side) => `${side.names.map(plain).join(' & ')} ${side.score}`).join(' – ')
        return [`${title}${update.league ? ' league' : ''}: ${score}`, `[See the battle](${update.link})`]
      }
    }
  })()
  const link = lines.pop()!
  const body = lines.join('\n')
  // The link is what the post is for, so a long body gives way to it.
  const room = MESSAGE_MAX - link.length - 1
  return `${body.length <= room ? body : `${body.slice(0, room - 1)}…`}\n${link}`
}
