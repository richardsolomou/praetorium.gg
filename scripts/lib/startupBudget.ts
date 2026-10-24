/**
 * How long a web replica may take to answer readiness: a first catalogue download and compilation, then the
 * catalogue build production readiness waits for. Swarm counts its start period from container start, so the
 * server's own waits share one deadline from process start rather than each starting a fresh budget.
 */
export const STARTUP_BUDGET_MS = 30 * 60_000

/** The whole milliseconds left at `elapsed` after the process started, as `AbortSignal.timeout` requires. */
export function startupRemainingMs(elapsed = performance.now()) {
  return Math.max(0, Math.floor(STARTUP_BUDGET_MS - elapsed))
}
