import { useQuery } from '@tanstack/react-query'
import { posthog } from 'posthog-js'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { type NativePushAnswer, requestNativePush, supportsNativePush } from '../../nativeBridge'
import { registerThisDevice } from '../../pushNotifications'
import { notificationSettingsQuery } from '../../queries'
import { errorMessage } from '../../queryClient'

const DISMISSED_KEY = 'praetorium-notifications-dismissed'

export function HomeNotifications() {
  const { data: settings } = useQuery(notificationSettingsQuery())
  const [device, setDevice] = useState<NativePushAnswer | null>(null)
  const [dismissed, setDismissed] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    if (!supportsNativePush()) return
    setDismissed(localStorage.getItem(DISMISSED_KEY) === 'true')
    void requestNativePush(false).then((answer) => setDevice(answer ?? { status: 'unavailable' }))
  }, [])

  if (!settings?.available || dismissed || (device?.status !== 'undetermined' && device?.status !== 'unavailable')) return null

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
    <section className="border-b border-edge bg-panel" aria-label="Notifications">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
        <div>
          <p className="font-semibold">Get notified about your games</p>
          <p className="text-sm text-dim">Allow notifications for new battles, friend requests, and league updates.</p>
          {error ? <p className="mt-1 text-sm text-destructive">{errorMessage(error)}</p> : null}
        </div>
        <div className="flex gap-2">
          <Button size="sm" disabled={pending} onClick={() => void allow()}>
            {device.status === 'undetermined' ? 'Allow notifications' : 'Retry notifications'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              localStorage.setItem(DISMISSED_KEY, 'true')
              setDismissed(true)
            }}
          >
            Not now
          </Button>
        </div>
      </div>
    </section>
  )
}
