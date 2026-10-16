import { useQuery } from '@tanstack/react-query'
import { ImagePlus } from 'lucide-react'
import { useState, type DragEvent } from 'react'
import { MAX_DATASHEET_PHOTOS } from '../../../core/collectionPhotos'
import { collectionPhotosQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { useCollectionPhotoUpload } from '../../useCollection'

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']

/** Drop photos of a datasheet's models here, or click to choose them; each uploads in turn until the datasheet holds its most. */
export function PhotoDropZone({ entryId, name, className = '' }: { entryId: string; name: string; className?: string }) {
  const { data: photos } = useQuery(collectionPhotosQuery())
  const upload = useCollectionPhotoUpload()
  const [dragging, setDragging] = useState(false)
  const [adding, setAdding] = useState<{ current: number; total: number } | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const room = MAX_DATASHEET_PHOTOS - (photos?.[entryId]?.length ?? 0)
  if (room <= 0) return null

  const add = async (files: File[]) => {
    const images = files.filter((file) => ACCEPTED.includes(file.type))
    const chosen = images.slice(0, room)
    setProblem(
      images.length < files.length
        ? 'Choose JPEG, PNG or WebP photos.'
        : chosen.length < images.length
          ? `Only ${room} more ${room === 1 ? 'photo fits' : 'photos fit'}: you can add up to ${MAX_DATASHEET_PHOTOS} of each datasheet.`
          : null,
    )
    for (const [index, file] of chosen.entries()) {
      setAdding({ current: index + 1, total: chosen.length })
      try {
        await upload.mutateAsync({ entryId, file })
      } catch (error) {
        setProblem(errorMessage(error, 'The photo could not be saved.'))
        break
      }
    }
    setAdding(null)
  }
  const drop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    if (!adding) void add([...event.dataTransfer.files])
  }

  return (
    <div
      className={`flex flex-col gap-1 ${className}`}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={drop}
    >
      <label
        data-photo-drop
        data-dragging={dragging || undefined}
        className="relative grid min-h-20 flex-1 cursor-pointer place-items-center content-center gap-1 border border-dashed border-edge-strong bg-sunken/60 p-2 text-center text-xs text-dim transition-colors focus-within:border-info hover:border-info hover:text-info data-dragging:border-info data-dragging:bg-info/10 data-dragging:text-info"
      >
        <input
          type="file"
          accept={ACCEPTED.join(',')}
          multiple
          className="sr-only"
          disabled={Boolean(adding)}
          aria-label={`Choose photos of your ${name}`}
          onChange={(event) => {
            const files = [...(event.target.files ?? [])]
            event.target.value = ''
            void add(files)
          }}
        />
        <ImagePlus className="size-5" aria-hidden />
        {adding ? (
          <output>
            Adding {adding.current} of {adding.total}…
          </output>
        ) : (
          <span>
            <span className="font-semibold text-bone">{dragging ? 'Drop to add' : 'Add your photos'}</span>
            <span className="block">Drop here or click</span>
          </span>
        )}
      </label>
      {problem ? (
        <p role="alert" className="text-xs text-destructive">
          {problem}
        </p>
      ) : null}
    </div>
  )
}
