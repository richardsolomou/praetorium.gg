import { describe, expect, it } from 'vitest'
import { appStateChanged, initialAppLifecycle, WEB_RESUME_SCRIPT } from './lifecycle'

describe('app lifecycle', () => {
  it('resumes the web application after a background cycle', () => {
    const backgrounded = appStateChanged(initialAppLifecycle('active'), 'background')

    expect(appStateChanged(backgrounded.lifecycle, 'active')).toEqual({
      lifecycle: { status: 'active', backgrounded: false },
      shouldResumeWebApp: true,
    })
  })

  it('carries a background cycle through the iOS inactive transition', () => {
    const backgrounded = appStateChanged(initialAppLifecycle('background'), 'inactive')

    expect(appStateChanged(backgrounded.lifecycle, 'active').shouldResumeWebApp).toBe(true)
  })

  it('does not reconnect for a foreground-only inactive transition', () => {
    const inactive = appStateChanged(initialAppLifecycle('active'), 'inactive')

    expect(appStateChanged(inactive.lifecycle, 'active').shouldResumeWebApp).toBe(false)
  })

  it('nudges both realtime and query clients on resume', () => {
    expect(WEB_RESUME_SCRIPT).toContain("window.dispatchEvent(new Event('offline'))")
    expect(WEB_RESUME_SCRIPT).toContain("window.dispatchEvent(new Event('online'))")
    expect(WEB_RESUME_SCRIPT).toContain("document.dispatchEvent(new Event('visibilitychange'))")
  })
})
