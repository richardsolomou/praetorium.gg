import posthog from '@posthog/rollup-plugin'

type Environment = Record<string, string | undefined>

/**
 * PostHog's source-map upload for the browser bundle, or undefined when this build does not upload.
 * Uploads run in CI with credentials; `POSTHOG_UPLOAD_SOURCEMAPS` forces them on (`true`) or off (`false`).
 */
export function postHogSourceMaps(env: Environment) {
  const personalApiKey = env.POSTHOG_CLI_API_KEY
  const projectId = env.POSTHOG_CLI_PROJECT_ID
  const requested = env.POSTHOG_UPLOAD_SOURCEMAPS
  const upload = requested === 'true' || (requested !== 'false' && env.CI === 'true' && Boolean(personalApiKey && projectId))
  if (!upload) return undefined
  if (!personalApiKey || !projectId) throw new Error('Uploading source maps needs POSTHOG_CLI_API_KEY and POSTHOG_CLI_PROJECT_ID')
  // Hidden maps carry no `sourceMappingURL`, and deleting them after upload keeps the original source off the public site.
  // Symbol sets keyed by the commit let error tracking match a stack trace to the release that served it.
  const sourcemaps = {
    enabled: true,
    deleteAfterUpload: true,
    releaseName: 'praetorium-web',
    releaseVersion: env.GITHUB_SHA,
    releaseMode: 'symbol-set' as const,
  }
  const plugin = posthog({ personalApiKey, projectId, host: env.POSTHOG_CLI_HOST, sourcemaps })
  // Symbol-set chunk ids are random, so hashing them into file names would rename unchanged code on every release;
  // without that the plugin stamps each id after the name is fixed, and publishWebAssets keeps the first stored copy.
  delete plugin.augmentChunkHash
  // The server bundle is not what browsers run, and Nitro bundles it again, so its maps would describe nothing deployed.
  // Web workers are inlined into their parent chunk as strings, so they get no plugin: no file of theirs exists to map,
  // and their random ids would rename the parent.
  return { ...plugin, applyToEnvironment: (environment: { name: string }) => environment.name === 'client' }
}
