import { useQuery } from '@tanstack/react-query'
import { posthog } from 'posthog-js'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { type NativePushAnswer, requestNativePush, supportsNativePush } from '../../nativeBridge'
import { registerThisDevice } from '../../pushNotifications'
import { notificationSettingsQuery } from '../../queries'
import { useStoredValue, writeStoredValue } from '../../storedValue'
import { Problem } from '../../components/Problem'
import { useBrowserNotifications } from '../account/BrowserNotifications'

const DISMISSED_KEY = 'praetorium-notifications-dismissed'

export function HomeNotifications() {
  const dismissed = useStoredValue(DISMISSED_KEY) === 'true'
  if (dismissed) return null
  return supportsNativePush() ? <AppNotificationsOffer /> : <BrowserNotificationsOffer />
}

function AppNotificationsOffer() {
  const { data: settings } = useQuery(notificationSettingsQuery())
  const [device, setDevice] = useState<NativePushAnswer | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    void requestNativePush(false).then((answer) => setDevice(answer ?? { status: 'unavailable' }))
  }, [])

  if (!settings?.available || (device?.status !== 'undetermined' && device?.status !== 'unavailable')) return null

  const allow = async () => {
    setPending(true)
    setError(null)
    try {
      const answer = await registerThisDevice(true)
      posthog.capture('push_device_permission_requested', { status: answer?.status ?? 'unavailable' })
      setDevice(answer ?? { status: 'unavailable' })
      if (!answer || answer.status === 'unavailable') setError(new Error('This device could not be set up for notifications.'))
    } catch (cause) {
      setError(cause)
    } finally {
      setPending(false)
    }
  }

  return (
    <NotificationsOffer
      pending={pending}
      error={error}
      allowLabel={device.status === 'undetermined' ? 'Allow notifications' : 'Retry notifications'}
      onAllow={() => void allow()}
    />
  )
}

/** Hidden once this browser gets notices or blocks them; from then on the profile changes it. */
function BrowserNotificationsOffer() {
  const browser = useBrowserNotifications('home')
  if (!browser || browser.subscribed || browser.permission === 'denied') return null
  return (
    <NotificationsOffer
      pending={browser.pending}
      error={browser.error}
      allowLabel="Allow notifications"
      onAllow={() => void browser.change(true)}
    />
  )
}

function NotificationsOffer(props: { pending: boolean; error: unknown; allowLabel: string; onAllow: () => void }) {
  return (
    <section className="mx-auto max-w-6xl px-5 pt-6 sm:px-6" aria-label="Notifications">
      <div className="part flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
        <div>
          <p className="font-semibold">Get notified about your games</p>
          <p className="text-sm text-dim">Allow notifications for new battles, friend requests, and tournament updates.</p>
          {props.error ? <Problem error={props.error} className="mt-1" /> : null}
        </div>
        <div className="flex gap-2">
          <Button size="sm" disabled={props.pending} onClick={props.onAllow}>
            {props.allowLabel}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => writeStoredValue(DISMISSED_KEY, 'true')}>
            Not now
          </Button>
        </div>
      </div>
    </section>
  )
}
