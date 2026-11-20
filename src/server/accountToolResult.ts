import { refusalsAsErrors, structured } from './agentTools'
import { agentWrites } from './mutationTelemetry'

// Rosters and battles can be public, so a write may publish to other players.
export const WRITE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true } as const

export function resultOf(work: () => Promise<Record<string, unknown>>) {
  return refusalsAsErrors(async () => structured(await agentWrites.run(true, work)))
}
