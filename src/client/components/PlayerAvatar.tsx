import { useEffect, useState } from 'react'

export function PlayerAvatar({ name, image, className = 'size-9' }: { name: string; image?: string | null; className?: string }) {
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [image])

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-edge-strong bg-raised font-bold text-dim uppercase ${className}`}
      aria-hidden
    >
      {image && !broken ? (
        <img src={image} alt="" className="size-full object-cover" onError={() => setBroken(true)} />
      ) : (
        <span>{name.trim().charAt(0) || '?'}</span>
      )}
    </span>
  )
}
