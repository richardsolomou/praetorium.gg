/**
 * Where Valkey is, if this instance has one.
 *
 * Kept apart from the client because two very different bundles need to ask this
 * question. The app is bundled by Vite and can carry `iovalkey`; the container
 * entrypoint is bundled by esbuild into ESM, where that package's own
 * `require` calls do not survive. Answering it here costs the entrypoint nothing
 * and keeps one implementation of the answer.
 *
 * Unset is a supported deployment rather than an error: a single container keeps
 * sessions in Postgres and fans out live updates in process, which is what
 * self-hosting one replica has always done.
 */
export function valkeyUrl(environment: NodeJS.ProcessEnv = process.env) {
  return environment.VALKEY_URL?.trim() || environment.REDIS_URL?.trim() || undefined
}
