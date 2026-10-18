import { offlineActionSchemas, type OfflineActionKind } from '../contracts/offlineActions'
import { productActions } from './productActions'

export const offlineActions = Object.fromEntries(
  Object.entries(offlineActionSchemas).map(([kind, schema]) => [
    kind,
    (owner: string, input: unknown) => productActions[kind as OfflineActionKind](owner, schema.parse(input)),
  ]),
) as Record<OfflineActionKind, (owner: string, input: unknown) => Promise<unknown>>
