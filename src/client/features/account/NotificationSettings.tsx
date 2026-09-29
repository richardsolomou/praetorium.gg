import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { posthog } from 'posthog-js'
import { Button } from '@/components/ui/button'
import { type NativePushAnswer, requestNativePush, supportsNativePush } from '../../nativeBridge'
import { registerThisDevice } from '../../pushNotifications'
import { notificationSettingsQuery } from '../../queries'
import { errorMessage } from '../../queryClient'

const DEVICE_STATES: Record<NativePushAnswer['status'], string> = {
  granted: 'Notifications are allowed on this device.',
  undetermined: 'This device has not been asked yet.',
  denied: 'Notifications for Praetorium are off in this device’s settings.',
  unavailable: 'This device could not be set up for notifications.',
}

/** The system prompt appears only after the player presses a permission button here or on Home. */
export function NotificationSettings() {
  const { data: settings } = useQuery(notificationSettingsQuery())
  const [device, setDevice] = useState<NativePushAnswer | null>(null)
  // Read after hydration: the server cannot know whether this page is inside the app.
  const [native, setNative] = useState(false)
  useEffect(() => {
    if (!supportsNativePush()) return
    setNative(true)
    void requestNativePush(false).then((answer) => setDevice(answer ?? { status: 'unavailable' }))
  }, [])
  const allow = useMutation({
    mutationFn: () => registerThisDevice(true),
    onSuccess: (answer) => {
      const status = answer?.status ?? 'unavailable'
      setDevice(answer ?? { status: 'unavailable' })
      posthog.capture('push_device_permission_requested', { status })
    },
  })

  if (!settings?.available) return null
  return (
    <section className="space-y-4 border border-edge bg-panel p-5 md:p-7 lg:col-span-2">
      <div>
        <p className="rubric border-b border-edge pb-2">Notifications</p>
        <h2 className="mt-4 text-base">Notifications on your phone</h2>
        <p className="mt-1 text-sm text-dim">
          The Praetorium app tells you about new battles, friend requests, and league entries or rosters that need your attention.
        </p>
      </div>
      {native ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-edge pt-4">
          <p className="text-sm text-dim">{device ? DEVICE_STATES[device.status] : 'Checking this device…'}</p>
          {device?.status === 'undetermined' || device?.status === 'unavailable' ? (
            <Button variant="outline" disabled={allow.isPending} onClick={() => allow.mutate()}>
              {device.status === 'undetermined' ? 'Allow on this device' : 'Retry on this device'}
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-dim">Notifications arrive in the Praetorium mobile app.</p>
      )}
      {allow.error ? <p className="text-sm text-destructive">{errorMessage(allow.error)}</p> : null}
    </section>
  )
}
