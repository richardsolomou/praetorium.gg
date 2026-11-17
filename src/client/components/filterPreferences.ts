import { LIST_FILTER_SCOPES, type ListFilterScope } from '../../core/listFilter'
import { writeStoredValue } from '../storedValue'

export const filterPreferencesKey = (scope: ListFilterScope) => `praetorium:filters:${scope}`

/** Sign-out leaves them on the account; left here, they would upload into whoever signs in next. */
export function forgetDeviceFilterPreferences() {
  for (const scope of LIST_FILTER_SCOPES) writeStoredValue(filterPreferencesKey(scope), null)
}
