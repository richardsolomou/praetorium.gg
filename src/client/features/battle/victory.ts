const CELEBRATED_KEY = 'praetorium.celebrated-battles'

/** Fallbacks for a canvas that has to paint before the stylesheet has been read. */
const SIDE_COLOURS = ['#df8078', '#7eaa9e']

function tintColours(side: number) {
  const styles = getComputedStyle(document.documentElement)
  const named = ['--color-side-a', '--color-side-b', '--color-parchment'].map((name) => styles.getPropertyValue(name).trim())
  const found = named.filter(Boolean)
  return found.length ? [found[side] ?? found[0]!, ...found] : SIDE_COLOURS
}

function celebrated(token: string) {
  try {
    const seen = new Set(JSON.parse(sessionStorage.getItem(CELEBRATED_KEY) ?? '[]') as string[])
    if (seen.has(token)) return true
    seen.add(token)
    sessionStorage.setItem(CELEBRATED_KEY, JSON.stringify([...seen]))
    return false
  } catch {
    // A blocked store only risks celebrating the same win twice, which is not a failure.
    return false
  }
}

/**
 * The confetti a won battle is worth, on the winner's own device and once per battle.
 *
 * Loaded on demand, because a library that runs for three seconds at the end of a game
 * has no business in the bundle every other screen downloads. It draws on a canvas of
 * ours rather than the library's own, which animates inside a worker built from a blob:
 * the site's script policy refuses those, and a decoration is no reason to widen it.
 * A player who has asked for less motion gets the result without the animation.
 */
export async function celebrateVictory(token: string, side: number) {
  if (typeof window === 'undefined') return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  if (celebrated(token)) return
  const { default: confetti } = await import('canvas-confetti')
  const canvas = document.createElement('canvas')
  canvas.dataset.victory = 'confetti'
  canvas.setAttribute('aria-hidden', 'true')
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:60'
  document.body.append(canvas)
  const fire = confetti.create(canvas, { resize: true, useWorker: false })
  const colors = tintColours(side)
  // Two low, wide bursts from the bottom corners: the middle of the screen is where the
  // score is, and it stays readable underneath.
  await Promise.all(
    [
      [0.1, 60],
      [0.9, 120],
    ].map(([at, angle]) =>
      // `create` answers with null when the browser cannot animate, which `Promise.all` is not asked to hold.
      Promise.resolve(
        fire({
          particleCount: 110,
          spread: 75,
          angle,
          startVelocity: 55,
          ticks: 220,
          origin: { x: at, y: 0.95 },
          colors,
          disableForReducedMotion: true,
        }),
      ),
    ),
  )
  canvas.remove()
}
