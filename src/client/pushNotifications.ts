import { posthog } from 'posthog-js'
import { registerPushDevice, unregisterPushDevice } from './functions'
import { requestNativePush } from './nativeBridge'

/**
 * Bind this device to the signed-in account when the operating system allows it.
 *
 * `prompt` is only ever true after the player asked for notifications, so the
 * system prompt never appears on its own.
 */
export async function registerThisDevice(prompt: boolean) {
  const answer = await requestNativePush(prompt)
  if (answer?.status === 'granted') {
    await registerPushDevice({ data: { token: answer.token, platform: answer.platform } })
    posthog.capture('push_device_registered', { platform: answer.platform, prompted: prompt })
  }
  return answer
}

/**
 * Stop this device receiving the signed-out account's notices.
 *
 * Bounded and never throws, because signing out must not wait on the shell or
 * fail because the server could not be told.
 */
export async function forgetThisDevice() {
  try {
    const answer = await requestNativePush(false, 3_000)
    if (answer?.status === 'granted') {
      await unregisterPushDevice({ data: { token: answer.token } })
      posthog.capture('push_device_unregistered', { platform: answer.platform })
    }
  } catch {
    // The next account to sign in on this device takes its token over anyway.
  }
}
