import { createRequire } from 'node:module'
import { expect, test, vi } from 'vitest'

const { provisionExtensionIos } = createRequire(import.meta.url)('./provisionExtensionsIos.js') as {
  provisionExtensionIos: (...args: unknown[]) => Promise<void>
}

function setup() {
  const certificate = { id: 'phone-certificate' }
  const profile = { id: 'watch-profile' }
  const credentials = { distributionCertificate: certificate, provisioningProfile: profile }
  const ctx = { appStore: { ensureAuthenticatedAsync: vi.fn(), ensureBundleIdExistsAsync: vi.fn() } }
  const app = { account: { name: 'owner' }, projectName: 'praetorium', bundleIdentifier: 'gg.praetorium.watch' }
  const target = { targetName: 'PraetoriumWatch', parentBundleIdentifier: 'gg.praetorium', entitlements: {} }
  const api = {
    IosDistributionType: { AppStore: 'APP_STORE' },
    getBuildCredentialsAsync: vi.fn().mockResolvedValueOnce({ distributionCertificate: certificate }).mockResolvedValueOnce(null),
    validateProvisioningProfileAsync: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),
    CreateProvisioningProfile: vi.fn(
      class {
        runAsync = vi.fn().mockResolvedValue(profile)
      },
    ),
    assignBuildCredentialsAsync: vi.fn().mockResolvedValue(credentials),
  }
  return { ctx, app, target, api, certificate, profile }
}

test('assigns the iPhone certificate to the new Watch App Store profile', async () => {
  const { ctx, app, target, api, certificate, profile } = setup()
  await provisionExtensionIos(ctx, app, target, api)
  expect(api.assignBuildCredentialsAsync).toHaveBeenCalledWith(ctx, app, 'APP_STORE', certificate, profile)
})

test('preserves an existing valid Watch profile on a repeated run', async () => {
  const { ctx, app, target, api } = setup()
  api.validateProvisioningProfileAsync.mockReset().mockResolvedValue(true)
  await provisionExtensionIos(ctx, app, target, api)
  expect(api.CreateProvisioningProfile).not.toHaveBeenCalled()
})

test('fails if the assigned Watch profile does not pass validation', async () => {
  const { ctx, app, target, api } = setup()
  api.validateProvisioningProfileAsync.mockReset().mockResolvedValue(false)
  await expect(provisionExtensionIos(ctx, app, target, api)).rejects.toThrow('The PraetoriumWatch provisioning profile failed validation.')
})

test('requires the existing iPhone distribution certificate', async () => {
  const { ctx, app, target, api } = setup()
  api.getBuildCredentialsAsync.mockReset().mockResolvedValue(null)
  await expect(provisionExtensionIos(ctx, app, target, api)).rejects.toThrow(
    'The iPhone App Store distribution certificate must already be configured in EAS.',
  )
})

test('does not write signing credentials when Apple authentication fails', async () => {
  const { ctx, app, target, api } = setup()
  ctx.appStore.ensureAuthenticatedAsync.mockRejectedValue(new Error('Apple rejected the key'))
  await provisionExtensionIos(ctx, app, target, api).catch(() => {})
  expect(api.assignBuildCredentialsAsync).not.toHaveBeenCalled()
})

test('stops when registering the Watch bundle identifier fails', async () => {
  const { ctx, app, target, api } = setup()
  ctx.appStore.ensureBundleIdExistsAsync.mockRejectedValue(new Error('Apple rejected the identifier'))
  await expect(provisionExtensionIos(ctx, app, target, api)).rejects.toThrow('Apple rejected the identifier')
})

test('surfaces an EAS write failure so a partial setup cannot be reported as ready', async () => {
  const { ctx, app, target, api } = setup()
  api.assignBuildCredentialsAsync.mockRejectedValue(new Error('EAS write failed'))
  await expect(provisionExtensionIos(ctx, app, target, api)).rejects.toThrow('EAS write failed')
})
