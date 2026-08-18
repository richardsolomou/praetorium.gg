const HUES = [4, 24, 43, 82, 145, 183, 211, 242, 278, 322]

export function factionColour(id: string) {
  let hash = 0
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) | 0
  return `hsl(${HUES[Math.abs(hash) % HUES.length]} 58% 53%)`
}

export function FactionMark({ id, icon, size = 'md' }: { id: string; icon: string | null; size?: 'md' | 'lg' }) {
  const colour = factionColour(id)

  return (
    <span
      aria-hidden
      style={{ borderColor: colour, backgroundColor: `color-mix(in srgb, ${colour} 16%, transparent)` }}
      className={`${size === 'lg' ? 'size-14 p-2' : 'size-9 p-1.5'} flex shrink-0 items-center justify-center rounded-full border`}
    >
      {icon ? (
        <img src={icon} alt="" className="size-full object-contain invert" />
      ) : (
        <span className="size-2 rounded-full" style={{ backgroundColor: colour }} />
      )}
    </span>
  )
}
