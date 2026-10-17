import { useState } from 'react'
import { cn } from '@/lib/utils'

export function PlayerAvatar({ name, image, className = 'size-9' }: { name: string; image?: string | null; className?: string }) {
  // Remembers which picture failed, so a new picture gets its own attempt.
  const [brokenImage, setBrokenImage] = useState<string | null>(null)

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-edge-strong bg-raised font-bold text-dim uppercase',
        className,
      )}
      aria-hidden
    >
      {image && image !== brokenImage ? (
        <img src={image} alt="" className="size-full object-cover" onError={() => setBrokenImage(image)} />
      ) : (
        <span>{name.trim().charAt(0) || '?'}</span>
      )}
    </span>
  )
}
