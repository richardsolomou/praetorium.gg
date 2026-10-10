import { z } from 'zod'

export const MAX_LOCAL_STATE_BYTES = 50_000_000
export const MAX_LOCAL_OPERATIONS = 2_000
export const localOperationSchema = z.object({
  id: z.uuid(),
  resource: z.string().min(1).max(256),
  kind: z.string().min(1).max(80),
  input: z.unknown(),
  attempted: z.boolean().optional(),
  dependencies: z.array(z.string().min(1).max(256)).max(8).optional(),
  createdAt: z.number().int().nonnegative(),
  status: z.enum(['pending', 'conflict', 'refused']),
  message: z.string().max(2_000).optional(),
})
export type LocalOperation = z.infer<typeof localOperationSchema>

export const localStateSchema = z.object({
  version: z.literal(1),
  owner: z.string().min(1).max(128),
  epoch: z.string().min(1).max(64),
  revision: z.number().int().nonnegative(),
  syncLease: z.object({ holder: z.uuid(), expiresAt: z.number().int().nonnegative() }).optional(),
  operations: z.array(localOperationSchema).max(MAX_LOCAL_OPERATIONS),
  documents: z.record(z.string().max(256), z.object({ data: z.unknown(), serverVersion: z.number().int().nonnegative().nullable() })),
})
export type LocalState = z.infer<typeof localStateSchema>

export function emptyLocalState(owner: string): LocalState {
  return { version: 1, owner, epoch: crypto.randomUUID(), revision: 0, operations: [], documents: {} }
}

export function parseLocalState(value: unknown): LocalState | null {
  const parsed = localStateSchema.safeParse(value)
  if (!parsed.success || new TextEncoder().encode(JSON.stringify(parsed.data)).byteLength > MAX_LOCAL_STATE_BYTES) return null
  if (new Set(parsed.data.operations.map((operation) => operation.id)).size !== parsed.data.operations.length) return null
  return parsed.data
}
