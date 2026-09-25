/** Keep Valkey configuration separate from `iovalkey` so the esbuild container entrypoint can import it; an unset URL supports one replica. */
export function valkeyUrl(environment: NodeJS.ProcessEnv = process.env) {
  return environment.VALKEY_URL?.trim() || environment.REDIS_URL?.trim() || undefined
}
