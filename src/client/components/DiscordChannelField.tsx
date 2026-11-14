import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { discordWebhookSchema } from '../../core/eventChannel'
import { setEventChannel } from '../functions'
import { eventChannelQuery } from '../queries'
import { Problem } from './Problem'

type Host = { kind: 'group' | 'tournament'; token: string }

/** A link to save in place of the current one, or `remove` to stop posting; neither leaves the channel as it is. */
export type DiscordChannelValue = { url: string; remove: boolean }

export const DISCORD_CHANNEL_UNCHANGED: DiscordChannelValue = { url: '', remove: false }

export const discordChannelValid = (value: DiscordChannelValue) => !value.url.trim() || discordWebhookSchema.safeParse(value.url).success

export async function saveDiscordChannel(host: Host, value: DiscordChannelValue) {
  if (value.url.trim()) await setEventChannel({ data: { ...host, url: value.url } })
  else if (value.remove) await setEventChannel({ data: { ...host, url: null } })
}

/**
 * The Discord channel an organizer posts updates to. A saved link is never shown again, since anyone holding it can post
 * as the channel; the field names its webhook as Discord lists it instead.
 */
export function DiscordChannelField({
  host,
  posts,
  value,
  disabled,
  onChange,
}: {
  host: Host
  /** What the channel receives, as the sentence's subject. */
  posts: string
  value: DiscordChannelValue
  disabled: boolean
  onChange: (value: DiscordChannelValue) => void
}) {
  const { data: channel, error } = useQuery(eventChannelQuery(host.kind, host.token))
  const id = `${host.kind}-discord-channel`
  const connected = channel && !value.remove
  const invalid = !discordChannelValid(value)
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Discord channel</Label>
      <Input
        id={id}
        type="url"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        value={value.url}
        placeholder={connected ? 'Paste a new webhook link to replace it' : 'https://discord.com/api/webhooks/…'}
        aria-invalid={invalid || undefined}
        aria-describedby={`${id}-hint`}
        disabled={disabled || channel === undefined}
        onChange={(event) => onChange({ url: event.target.value, remove: false })}
      />
      <div id={`${id}-hint`} className="text-xs text-dim">
        {invalid ? (
          <Problem className="text-xs">Paste the webhook link from the channel’s settings in Discord.</Problem>
        ) : connected ? (
          <p className={channel.stopped ? 'text-parchment' : undefined}>
            {channel.stopped
              ? `Discord stopped taking posts through the “${channel.name}” webhook. Paste its link again, or a new one, to start again.`
              : `${posts} post through the “${channel.name}” webhook.`}{' '}
            <Button variant="link" className="h-auto p-0 text-xs" disabled={disabled} onClick={() => onChange({ url: '', remove: true })}>
              Stop posting
            </Button>
          </p>
        ) : value.remove ? (
          <p>
            Nothing posts once you save.{' '}
            <Button variant="link" className="h-auto p-0 text-xs" disabled={disabled} onClick={() => onChange(DISCORD_CHANNEL_UNCHANGED)}>
              Keep posting
            </Button>
          </p>
        ) : (
          <p>
            {posts} post to a channel. In Discord, open the channel’s settings, then Integrations, then Webhooks, and copy a webhook’s link.
          </p>
        )}
      </div>
      {error ? <Problem error={error} /> : null}
    </div>
  )
}
