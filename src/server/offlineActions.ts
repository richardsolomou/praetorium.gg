import { offlineActionSchemas, type OfflineActionKind } from '../contracts/offlineActions'
import { productActions, submitSealedEventRoster } from './productActions'

export const offlineActions = {
  ...productActions,
  submitSealedEventRoster: (owner: string, input: unknown) =>
    submitSealedEventRoster(owner, offlineActionSchemas.submitSealedEventRoster.parse(input)),
} satisfies Record<OfflineActionKind, (owner: string, input: unknown) => Promise<unknown>>
