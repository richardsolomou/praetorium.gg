import { useQuery } from '@tanstack/react-query'
import { posthog } from 'posthog-js'
import { useEffect, useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { browserSubscription, supportsWebPush, turnOffWebPush, turnOnWebPush } from '../../webPush'
import { notificationSettingsQuery } from '../../queries'
import { Problem } from '../../components/Problem'

/** Whether this browser gets notices, and the taps that change it. Null until the browser has answered, or where it never can. */
export function useBrowserNotifications(surface: 'home' | 'profile') {
  const { data: settings } = useQuery(notificationSettingsQuery())
  const key = settings?.webPushKey ?? null
  const [state, setState] = useState<{ permission: NotificationPermission; subscribed: boolean } | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    if (!key || !supportsWebPush()) return
    void browserSubscription()
      .then((subscription) => setState({ permission: Notification.permission, subscribed: Boolean(subscription) }))
      .catch(() => setState(null))
  }, [key])

  const change = async (on: boolean) => {
    if (!key) return
    setPending(true)
    setError(null)
    try {
      if (on) {
        const permission = await turnOnWebPush(key, surface)
        setState({ permission, subscribed: permission === 'granted' })
      } else {
        await turnOffWebPush()
        posthog.capture('web_push_turned_off', { surface })
        setState({ permission: Notification.permission, subscribed: false })
      }
    } catch (cause) {
      setError(cause)
      posthog.captureException(cause, { operation: on ? 'web_push_turn_on' : 'web_push_turn_off' })
    } finally {
      setPending(false)
    }
  }

  return key && state ? { ...state, pending, error, change } : null
}

export function BrowserNotificationSettings() {
  const browser = useBrowserNotifications('profile')
  if (!browser) return null
  const blocked = browser.permission === 'denied'
  return (
    <section className="grid gap-3 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8">
      <div>
        <h3 className="text-base">Notifications</h3>
        <p className="mt-1 text-sm text-dim">New battles, friend requests, and group and tournament updates.</p>
      </div>
      <div className="space-y-3">
        <label htmlFor="browser-notifications" className="flex items-start justify-between gap-3">
          <span>
            <span className="block text-sm font-medium">Notifications in this browser</span>
            <span className="block text-xs text-dim">
              {blocked
                ? 'Your browser blocks notifications from Praetorium. Allow them in its site settings.'
                : 'Only this browser on this device.'}
            </span>
          </span>
          <Switch
            id="browser-notifications"
            checked={browser.subscribed}
            disabled={browser.pending || blocked}
            onCheckedChange={(on) => void browser.change(on)}
          />
        </label>
        {browser.error ? <Problem error={browser.error} /> : null}
      </div>
    </section>
  )
}
