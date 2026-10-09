import { existsSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export async function provisionWatchIos(ctx, app, target, api) {
  const distribution = api.IosDistributionType.AppStore
  const phone = await api.getBuildCredentialsAsync(ctx, { ...app, bundleIdentifier: target.parentBundleIdentifier }, distribution)
  if (!phone?.distributionCertificate) throw new Error('The iPhone App Store distribution certificate must already be configured in EAS.')
  await ctx.appStore.ensureAuthenticatedAsync()
  await ctx.appStore.ensureBundleIdExistsAsync(
    { accountName: app.account.name, bundleIdentifier: app.bundleIdentifier, projectName: app.projectName },
    { entitlements: target.entitlements, parentBundleIdentifier: target.parentBundleIdentifier },
  )
  const existing = await api.getBuildCredentialsAsync(ctx, app, distribution)
  if (await api.validateProvisioningProfileAsync(ctx, target, app, existing)) {
    console.log('The Watch App Store provisioning profile is already valid.')
    return
  }
  const profile = await new api.CreateProvisioningProfile(app, target, phone.distributionCertificate).runAsync(ctx)
  const credentials = await api.assignBuildCredentialsAsync(ctx, app, distribution, phone.distributionCertificate, profile)
  if (!(await api.validateProvisioningProfileAsync(ctx, target, app, credentials)))
    throw new Error('The Watch provisioning profile failed validation.')
  console.log('The Watch App Store provisioning profile is configured and validated in EAS.')
}

async function main() {
  for (const name of [
    'EXPO_TOKEN',
    'EXPO_ASC_API_KEY_PATH',
    'EXPO_ASC_KEY_ID',
    'EXPO_ASC_ISSUER_ID',
    'EXPO_APPLE_TEAM_ID',
    'EXPO_APPLE_TEAM_TYPE',
  ]) {
    if (!process.env[name]) throw new Error(`Missing ${name}`)
  }
  const binary = process.env.PATH.split(delimiter)
    .map((directory) => join(directory, 'eas'))
    .find(existsSync)
  if (!binary) throw new Error('Run with pnpm --package=eas-cli@23.2.0 dlx -c to expose the pinned EAS CLI.')
  const requireEas = createRequire(createRequire(realpathSync(binary)).resolve('eas-cli/package.json'))
  if (requireEas('./package.json').version !== '23.2.0') throw new Error('Watch provisioning requires EAS CLI 23.2.0.')
  const load = (file) => requireEas(`./build/${file}`)
  const { expo } = createRequire(import.meta.url)('../mobile/app.json')
  const target = expo.extra.eas.build.experimental.ios.appExtensions.find((entry) => entry.targetName === 'PraetoriumWatch')
  if (!target) throw new Error('The PraetoriumWatch signing target is missing from app.json.')
  const { createGraphqlClient } = load('commandUtils/context/contextUtils/createGraphqlClient')
  const { getOwnerAccountForProjectIdAsync } = load('project/projectUtils')
  const { CredentialsContext } = load('credentials/context')
  const graphqlClient = createGraphqlClient({ accessToken: process.env.EXPO_TOKEN, sessionSecret: null })
  const account = await getOwnerAccountForProjectIdAsync(graphqlClient, expo.extra.eas.projectId)
  const ctx = new CredentialsContext({
    graphqlClient,
    nonInteractive: true,
    projectDir: fileURLToPath(new URL('../mobile', import.meta.url)),
  })
  await provisionWatchIos(
    ctx,
    { account, projectName: expo.slug, bundleIdentifier: target.bundleIdentifier, parentBundleIdentifier: expo.ios.bundleIdentifier },
    {
      ...target,
      parentBundleIdentifier: expo.ios.bundleIdentifier,
      entitlements: target.entitlements ?? {},
      buildConfiguration: 'Release',
    },
    {
      ...load('credentials/ios/actions/BuildCredentialsUtils'),
      ...load('credentials/ios/actions/CreateProvisioningProfile'),
      ...load('credentials/ios/validators/validateProvisioningProfile'),
      ...load('graphql/generated'),
    },
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
