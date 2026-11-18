import * as server from '../../server/functions'
import { queryResource } from '../../contracts/localState'
import { favouriteFactionsKey, favouriteDetachmentsKey, favouriteDatasheetsKey, onboardingKey } from '../queries/queryKeys'
import { localOwner, localClient, localDocument, hasLocalChanges, rememberDocument } from './localRuntime'
import { accountChanged, cachedRead } from './reads'

export async function accountRead<T>(key: readonly unknown[], online: () => Promise<T>) {
  const owner = localOwner()?.id
  const resource = queryResource(key)
  const local = await localDocument<T>(resource)
  if (local !== undefined && (!navigator.onLine || (await hasLocalChanges(resource)))) return local
  const result = await cachedRead(key, online, { updateCache: false })
  const saved = await rememberDocument(resource, result, null, owner, undefined, JSON.stringify({ data: local }))
  if (localOwner()?.id !== owner) throw accountChanged()
  const retained = saved ? (saved.data as T) : result
  localClient()?.setQueryData(key, retained)
  return retained
}

export const favouriteFactions = () => accountRead(favouriteFactionsKey(), () => server.favouriteFactions())
export const favouriteDetachments = () => accountRead(favouriteDetachmentsKey(), () => server.favouriteDetachments())
export const favouriteDatasheets = () => accountRead(favouriteDatasheetsKey(), () => server.favouriteDatasheets())
export const onboardingProgress = () => accountRead(onboardingKey(), () => server.onboardingProgress())
