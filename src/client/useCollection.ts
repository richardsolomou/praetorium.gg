import { useMutation, useQueryClient } from '@tanstack/react-query'
import { prepareCollectionPhoto } from './features/collection/preparePhoto'
import type { CollectionProgress } from '../core/collection'
import {
  removeCollectionPhoto,
  setCollectionModels,
  setCollectionProgress,
  setCollectionWanted,
  setOwned,
  uploadCollectionPhoto,
} from './functions'
import { collectionCountsQuery, collectionPhotosQuery, collectionProgressQuery, collectionQuery, collectionWishesQuery } from './queries'
import { collectionProfileKey, datasheetPhotosKey } from './queries/queryKeys'
import { localEngine } from './offline/localRuntime'

export function useCollectionMutation() {
  const queryClient = useQueryClient()
  const queryKey = collectionQuery().queryKey
  return useMutation({
    mutationFn: (input: { entryId: string; owned: boolean }) => setOwned({ data: input }),
    onMutate: async ({ entryId, owned }) => {
      await queryClient.cancelQueries({ queryKey })
      if (localEngine()) return { durable: true, wasOwned: false }
      const previous = queryClient.getQueryData<string[]>(queryKey)
      queryClient.setQueryData<string[]>(queryKey, (current = []) =>
        owned ? [...new Set([...current, entryId])] : current.filter((id) => id !== entryId),
      )
      // The server deletes a removed datasheet's count, so adding it back starts again at one.
      if (!owned)
        queryClient.setQueryData<Record<string, number>>(collectionCountsQuery().queryKey, (current) => {
          if (!current) return current
          const { [entryId]: _removed, ...rest } = current
          return rest
        })
      return { durable: false, wasOwned: previous?.includes(entryId) ?? false }
    },
    onError: (_error, { entryId }, context) => {
      if (context?.durable) return
      queryClient.setQueryData<string[]>(queryKey, (current = []) =>
        context?.wasOwned ? [...new Set([...current, entryId])] : current.filter((id) => id !== entryId),
      )
    },
    onSettled: (_data, _error, _input, context) => {
      if (context?.durable) return
      return Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: collectionCountsQuery().queryKey }),
        queryClient.invalidateQueries({ queryKey: collectionProgressQuery().queryKey }),
      ])
    },
  })
}

export function useCollectionCountMutation() {
  const queryClient = useQueryClient()
  const queryKey = collectionCountsQuery().queryKey
  return useMutation({
    scope: { id: 'collection-counts' },
    mutationFn: (input: { entryId: string; models: number }) => setCollectionModels({ data: input }),
    onMutate: async ({ entryId, models }) => {
      await queryClient.cancelQueries({ queryKey })
      if (localEngine()) return { durable: true, previous: undefined }
      const previous = queryClient.getQueryData<Record<string, number>>(queryKey)
      queryClient.setQueryData<Record<string, number>>(queryKey, (current = {}) => ({ ...current, [entryId]: models }))
      return { durable: false, previous }
    },
    onError: (_error, _input, context) => {
      if (!context?.durable) queryClient.setQueryData(queryKey, context?.previous)
    },
    onSettled: (_data, _error, _input, context) => {
      if (!context?.durable)
        return Promise.all([
          queryClient.invalidateQueries({ queryKey }),
          // The server lowers built and painted counts above the new total.
          queryClient.invalidateQueries({ queryKey: collectionProgressQuery().queryKey }),
        ])
    },
  })
}

/** An edit to one datasheet's entry in a per-datasheet record, shown at once and put back if the server refuses it. */
function useEntryMutation<Value, Input extends { entryId: string }>(
  queryKey: readonly unknown[],
  save: (input: Input) => Promise<unknown>,
  value: (input: Input) => Value | undefined,
) {
  const queryClient = useQueryClient()
  return useMutation({
    scope: { id: JSON.stringify(queryKey) },
    mutationFn: save,
    onMutate: async (input: Input) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<Record<string, Value>>(queryKey)
      // Shown at once, durable or not: a counter bounded by this one reads its bound from here before the save lands.
      queryClient.setQueryData<Record<string, Value>>(queryKey, (current = {}) => {
        const { [input.entryId]: _replaced, ...rest } = current
        const next = value(input)
        return next === undefined ? rest : { ...rest, [input.entryId]: next }
      })
      return { durable: Boolean(localEngine()), previous }
    },
    onError: (_error, _input, context) => {
      queryClient.setQueryData(queryKey, context?.previous)
    },
    onSettled: (_data, _error, _input, context) => {
      if (!context?.durable) return queryClient.invalidateQueries({ queryKey })
    },
  })
}

export const useCollectionProgressMutation = () =>
  useEntryMutation<CollectionProgress, { entryId: string } & CollectionProgress>(
    collectionProgressQuery().queryKey,
    (data) => setCollectionProgress({ data }),
    ({ built, painted }) => (built ? { built, painted } : undefined),
  )

export const useCollectionWantedMutation = () =>
  useEntryMutation<number, { entryId: string; wanted: number }>(
    collectionWishesQuery().queryKey,
    (data) => setCollectionWanted({ data }),
    ({ wanted }) => wanted || undefined,
  )

function useInvalidatePhotos() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: collectionPhotosQuery().queryKey }),
      queryClient.invalidateQueries({ queryKey: collectionQuery().queryKey }),
      queryClient.invalidateQueries({ queryKey: collectionCountsQuery().queryKey }),
      queryClient.invalidateQueries({ queryKey: datasheetPhotosKey() }),
      queryClient.invalidateQueries({ queryKey: collectionProfileKey() }),
    ])
}

/** Adds a photo, and with it the datasheet to the collection; photos need a connection, so they are never queued. */
export function useCollectionPhotoUpload() {
  const onSettled = useInvalidatePhotos()
  return useMutation({
    mutationFn: async ({ entryId, file }: { entryId: string; file: File }) =>
      uploadCollectionPhoto({ data: { entryId, image: await prepareCollectionPhoto(file) } }),
    onSettled,
  })
}

export function useCollectionPhotoRemoval() {
  const onSettled = useInvalidatePhotos()
  return useMutation({ mutationFn: (photoId: string) => removeCollectionPhoto({ data: { photoId } }), onSettled })
}
