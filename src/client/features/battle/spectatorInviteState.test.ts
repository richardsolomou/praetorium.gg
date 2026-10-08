import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_ONBOARDING_PROGRESS, type OnboardingProgress } from '../../../core/onboarding'
import { spectatorInviteOffer } from './spectatorInviteState'

const progress = (...completedTasks: OnboardingProgress['completedTasks']): OnboardingProgress => ({
  ...EMPTY_ONBOARDING_PROGRESS,
  completedTasks,
})
const account = { id: 'viewer' }

describe('spectator invite offer', () => {
  it('invites a signed-out viewer to build an army', () => {
    expect(spectatorInviteOffer({ seated: false, me: null, progress: undefined })).toBe('roster')
  })

  it('leaves a seated player to their battle', () => {
    expect(spectatorInviteOffer({ seated: true, me: null, progress: undefined })).toBeNull()
  })

  it('waits for the account to load', () => {
    expect(spectatorInviteOffer({ seated: false, me: undefined, progress: undefined })).toBeNull()
  })

  it('waits for a signed-in viewer’s progress to load', () => {
    expect(spectatorInviteOffer({ seated: false, me: account, progress: undefined })).toBeNull()
  })

  it('invites an account without a roster to build an army', () => {
    expect(spectatorInviteOffer({ seated: false, me: account, progress: progress() })).toBe('roster')
  })

  it('invites an account with a roster to start a battle', () => {
    expect(spectatorInviteOffer({ seated: false, me: account, progress: progress('roster') })).toBe('battle')
  })

  it('leaves an account that has played a battle to watch', () => {
    expect(spectatorInviteOffer({ seated: false, me: account, progress: progress('roster', 'battle') })).toBeNull()
  })
})

describe('spectator invite suppression', () => {
  // The module keeps a dismissal for the open page, so each case starts from a fresh one.
  const load = () => import('./spectatorInviteState')
  beforeEach(() => {
    vi.resetModules()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubStorage(stored: Record<string, string> = {}) {
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored[key] ?? null,
      setItem: (key: string, value: string) => {
        stored[key] = value
      },
    })
    return stored
  }

  it('shows the invite in a browser that has not dismissed it', async () => {
    stubStorage()
    expect((await load()).spectatorInviteSuppressed()).toBe(false)
  })

  it('hides the invite in a browser that dismissed it earlier', async () => {
    stubStorage({ 'praetorium-spectator-invite-dismissed': 'true' })
    expect((await load()).spectatorInviteSuppressed()).toBe(true)
  })

  it('remembers a dismissal for later visits', async () => {
    const stored = stubStorage()
    ;(await load()).dismissSpectatorInvite()
    expect(stored['praetorium-spectator-invite-dismissed']).toBe('true')
  })

  it('hides the invite inside the native application', async () => {
    stubStorage()
    vi.stubGlobal('window', { PraetoriumNative: { bridgeVersion: 3 } })
    expect((await load()).spectatorInviteSuppressed()).toBe(true)
  })

  it('keeps the invite shown when browser storage cannot be read', async () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
    })
    expect((await load()).spectatorInviteSuppressed()).toBe(false)
  })

  it('keeps a dismissal for the open page when browser storage refuses it', async () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('full')
      },
    })
    const invite = await load()
    invite.dismissSpectatorInvite()
    expect(invite.spectatorInviteSuppressed()).toBe(true)
  })
})
