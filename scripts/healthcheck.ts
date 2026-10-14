// Container health check for hosts that accept only a plain command; the image ships no curl or wget.
fetch(`http://127.0.0.1:${process.env.PORT ?? 3000}/api/health`, { signal: AbortSignal.timeout(5_000) }).then(
  (response) => (process.exitCode = response.ok ? 0 : 1),
  () => (process.exitCode = 1),
)
