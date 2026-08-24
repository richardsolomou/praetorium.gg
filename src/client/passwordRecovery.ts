import posthog from 'posthog-js'

export function finishPasswordRecovery(destination: string) {
  posthog.reset()
  window.location.replace(destination)
}
