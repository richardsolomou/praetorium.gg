/**
 * How long a web replica may take to answer readiness: a first catalogue download and compilation, then the
 * catalogue build production readiness waits for. Both the server's own wait and the Swarm start period use it.
 */
export const STARTUP_BUDGET_MS = 30 * 60_000
