import { useQuery } from '@tanstack/react-query'
import { posthog } from 'posthog-js'
import { useEffect } from 'react'
import { supportsNativePush } from '../../nativeBridge'
import { registerThisDevice } from '../../pushNotifications'
import { supportsWebPush, syncThisBrowser } from '../../webPush'
import { meQuery, notificationSettingsQuery } from '../../queries'

/**
 * Keep this device bound to whoever is signed in on it.
 *
 * Silent: it asks the shell without the system prompt, so it only registers a
 * device that has already allowed notifications. Repeating it on every launch is
 * what moves a device to the account signed in now and keeps its token current.
 */
export function NativePushRegistration() {
  const { data: me } = useQuery(meQuery())
  const player = me && !me.impersonatedBy ? me.id : null
  const { data: settings } = useQuery({ ...notificationSettingsQuery(), enabled: Boolean(player) })
  const available = Boolean(settings?.available)
  const webPushKey = settings?.webPushKey
  useEffect(() => {
    if (!player || !available || !supportsNativePush()) return
    void registerThisDevice(false).catch((error: unknown) => posthog.captureException(error, { operation: 'push_registration' }))
  }, [player, available])
  // A browser that already allowed notifications, and only that one, is bound the same way.
  useEffect(() => {
    if (!player || !webPushKey || !supportsWebPush()) return
    void syncThisBrowser().catch((error: unknown) => posthog.captureException(error, { operation: 'web_push_registration' }))
  }, [player, webPushKey])
  return null
}
