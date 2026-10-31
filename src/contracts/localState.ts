import { z } from 'zod'
import { idSchema } from '../core/commands'
import { jsonByteLength } from '../core/json'
import { predatesEventHosts } from './savedSealedEvents'
import { migrateSavedRoster } from '../core/savedRosterMigrations'
import { currentCommands, currentOfflineAction, currentResource } from '../core/releasedNames'

export const MAX_LOCAL_STATE_BYTES = 50_000_000
export const MAX_LOCAL_OPERATIONS = 2_000
const localOperationSchema = z.object({
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

const localStateSchema = z.object({
  version: z.literal(1),
  owner: z.string().min(1).max(128),
  epoch: idSchema,
  revision: z.number().int().nonnegative(),
  syncLease: z.object({ holder: z.uuid(), expiresAt: z.number().int().nonnegative() }).optional(),
  operations: z.array(localOperationSchema).max(MAX_LOCAL_OPERATIONS),
  documents: z.record(z.string().max(256), z.object({ data: z.unknown(), serverVersion: z.number().int().nonnegative().nullable() })),
})
export type LocalState = z.infer<typeof localStateSchema>

export function emptyLocalState(owner: string): LocalState {
  return { version: 1, owner, epoch: crypto.randomUUID(), revision: 0, operations: [], documents: {} }
}

/** Saved work queued under the previous release's names, renamed so this release can sync and show it. */
export function withCurrentNames(value: unknown) {
  const state = currentCommands(value) as { operations?: unknown; documents?: unknown }
  if (!Array.isArray(state?.operations) || typeof state.documents !== 'object' || state.documents === null) return state
  return {
    ...state,
    operations: state.operations.map((operation: { kind?: unknown; resource?: unknown; dependencies?: unknown; input?: unknown }) => ({
      ...operation,
      kind: (currentOfflineAction({ kind: operation.kind }) as { kind: unknown }).kind,
      ...(typeof operation.resource === 'string' ? { resource: currentResource(operation.resource) } : {}),
      ...(Array.isArray(operation.dependencies)
        ? {
            dependencies: operation.dependencies.map((dependency) =>
              typeof dependency === 'string' ? currentResource(dependency) : dependency,
            ),
          }
        : {}),
      ...(typeof operation.input === 'object' && operation.input !== null && 'identifiers' in operation.input
        ? { input: { ...operation.input, identifiers: (currentOfflineAction(operation.input) as { identifiers: unknown }).identifiers } }
        : {}),
    })),
    documents: Object.fromEntries(Object.entries(state.documents).map(([resource, document]) => [currentResource(resource), document])),
  }
}

export function parseLocalState(value: unknown): LocalState | null {
  const parsed = localStateSchema.safeParse(value)
  if (!parsed.success) return null
  for (const [resource, document] of Object.entries(parsed.data.documents)) {
    if (resource.startsWith('sealed-event:') && predatesEventHosts(document.data)) delete parsed.data.documents[resource]
    if (resource.startsWith('roster:')) document.data = migrateSavedRoster(document.data)
  }
  if (jsonByteLength(parsed.data) > MAX_LOCAL_STATE_BYTES) return null
  if (new Set(parsed.data.operations.map((operation) => operation.id)).size !== parsed.data.operations.length) return null
  return parsed.data
}
