import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import { Heart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { buttonClass } from '../../components/buttonClass'
import { type datasheetPhotos, likeCollectionPhoto } from '../../functions'
import { datasheetPhotosQuery, meQuery } from '../../queries'

type Gallery = Awaited<ReturnType<typeof datasheetPhotos>>

/** A photo's like count from its datasheet's gallery, which signed-in players other than its owner can toggle. */
export function PhotoLike({ entryId, photoId, name }: { entryId: string; photoId: string; name: string }) {
  const queryClient = useQueryClient()
  const { queryKey } = datasheetPhotosQuery(entryId)
  const { data: me } = useQuery(meQuery())
  const photo = useQuery(datasheetPhotosQuery(entryId)).data?.find((candidate) => candidate.photoId === photoId)
  const path = useRouterState({ select: (state) => state.location.href })
  const like = useMutation({
    mutationFn: (liked: boolean) => likeCollectionPhoto({ data: { photoId, liked } }),
    onMutate: async (liked) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<Gallery>(queryKey)
      queryClient.setQueryData<Gallery>(queryKey, (current) =>
        current?.map((candidate) =>
          candidate.photoId === photoId ? { ...candidate, liked, likes: candidate.likes + (liked ? 1 : -1) } : candidate,
        ),
      )
      return { previous }
    },
    onError: (_error, _liked, context) => queryClient.setQueryData(queryKey, context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })
  if (!photo) return null
  const label = `${photo.likes} ${photo.likes === 1 ? 'like' : 'likes'}`
  const count = (
    <>
      <Heart className={photo.liked ? 'fill-rust text-rust' : undefined} /> {photo.likes}
    </>
  )
  if (!me)
    return (
      <Link
        to="/sign-in"
        search={{ next: path }}
        rel="nofollow"
        className={buttonClass({ variant: 'ghost', size: 'sm', className: 'text-dim' })}
      >
        <span className="sr-only">Sign in to like this photo of {name}, </span>
        {count}
        <span className="sr-only">{label}</span>
      </Link>
    )
  if (me.id === photo.owner.id)
    return (
      <span className={buttonClass({ variant: 'ghost', size: 'sm', className: 'pointer-events-none text-dim' })} aria-label={label}>
        {count}
      </span>
    )
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-dim"
      aria-label={`Like this photo of ${name}, ${label}`}
      aria-pressed={photo.liked}
      disabled={like.isPending}
      onClick={() => like.mutate(!photo.liked)}
    >
      {count}
    </Button>
  )
}
