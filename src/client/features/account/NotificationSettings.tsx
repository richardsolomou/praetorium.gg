import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { setPushNotifications } from '../../../server/functions'
import { type NativePushAnswer, requestNativePush, supportsNativePush } from '../../nativeBridge'
import { registerThisDevice } from '../../pushNotifications'
import { notificationSettingsQuery } from '../../queries'
import { errorMessage } from '../../queryClient'

const DEVICE_STATES: Record<NativePushAnswer['status'], string> = {
  granted: 'This device receives notifications.',
  undetermined: 'This device has not been asked yet.',
  denied: 'Notifications for Praetorium are off in this device’s settings.',
  unavailable: 'This device could not be set up for notifications.',
}

/**
 * Whether this player's phones are told about new battles, friends, and league news.
 *
 * Saved on the press like `BattleSharing`. The system prompt only appears from
 * the button here, because a player who has not seen what the notices are for
 * has no reason to allow them.
 */
export function NotificationSettings() {
  const { data: settings } = useQuery(notificationSettingsQuery())
  const queryClient = useQueryClient()
  const [device, setDevice] = useState<NativePushAnswer | null>(null)
  // Read after hydration: the server cannot know whether this page is inside the app.
  const [native, setNative] = useState(false)
  useEffect(() => {
    if (!supportsNativePush()) return
    setNative(true)
    void requestNativePush(false).then((answer) => setDevice(answer ?? { status: 'unavailable' }))
  }, [])
  const save = useMutation({
    mutationFn: (enabled: boolean) => setPushNotifications({ data: { enabled } }),
    onSuccess: (enabled) => queryClient.setQueryData(notificationSettingsQuery().queryKey, (current) => current && { ...current, enabled }),
  })
  const allow = useMutation({
    mutationFn: () => registerThisDevice(true),
    onSuccess: (answer) => setDevice(answer ?? { status: 'unavailable' }),
  })

  if (!settings?.available) return null
  return (
    <section className="space-y-4 border border-edge bg-panel p-5 md:p-7 lg:col-span-2">
      <div>
        <p className="rubric border-b border-edge pb-2">Notifications</p>
        <h2 className="mt-4 text-base">Notifications on your phone</h2>
        <p className="mt-1 text-sm text-dim">
          The Praetorium app tells you when a player starts a battle with you, answers a friend request, or when a league you entered
          accepts you, reveals its rosters, or unseals your roster.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Switch
          id="push-notifications"
          checked={settings.enabled}
          disabled={save.isPending}
          onCheckedChange={(enabled) => save.mutate(enabled)}
        />
        <Label htmlFor="push-notifications">Send notifications to my devices</Label>
      </div>
      {native ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-edge pt-4">
          <p className="text-sm text-dim">{device ? DEVICE_STATES[device.status] : 'Checking this device…'}</p>
          {device?.status === 'undetermined' ? (
            <Button variant="outline" disabled={allow.isPending} onClick={() => allow.mutate()}>
              Allow on this device
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-dim">Notifications arrive in the Praetorium mobile app.</p>
      )}
      {save.error || allow.error ? <p className="text-sm text-destructive">{errorMessage(save.error ?? allow.error)}</p> : null}
    </section>
  )
}
