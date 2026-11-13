/**
 * Every player's own colour: the one they chose, or one picked from their id, so it
 * reads the same on every device.
 *
 * Each colour has a text form, light enough to read at 4.5:1 or better on Panel, and
 * a fill for the controls that act for a side. Colours too dark to read as text keep a
 * deep fill under Bone ink, which is what lets greens in without their buttons passing
 * for Field Green; the rest fill with their text form under Void ink. Neighbours differ
 * in lightness or chroma as well as hue, and stay clear of Amber, Supporter Gold and Bone.
 * Colours that read alike as text share a family, which is what decides a clash.
 */
export const PLAYER_COLOURS = [
  { key: 'crimson', name: 'Crimson', family: 'red', text: [0.7, 0.19, 22], fill: [0.53, 0.2, 25] },
  { key: 'ruby', name: 'Ruby', family: 'magenta', text: [0.72, 0.17, 8], fill: [0.5, 0.19, 8] },
  { key: 'ember', name: 'Ember', family: 'orange', text: [0.76, 0.15, 50] },
  { key: 'copper', name: 'Copper', family: 'orange', text: [0.74, 0.13, 42], fill: [0.5, 0.12, 45] },
  { key: 'lemon', name: 'Lemon', family: 'yellow', text: [0.92, 0.16, 102] },
  { key: 'lime', name: 'Lime', family: 'lime', text: [0.88, 0.2, 132] },
  { key: 'emerald', name: 'Emerald', family: 'green', text: [0.78, 0.15, 158], fill: [0.48, 0.11, 160] },
  { key: 'teal', name: 'Teal', family: 'teal', text: [0.82, 0.11, 190] },
  { key: 'ice', name: 'Ice', family: 'blue', text: [0.9, 0.06, 215] },
  { key: 'azure', name: 'Azure', family: 'blue', text: [0.78, 0.13, 235] },
  { key: 'cobalt', name: 'Cobalt', family: 'blue', text: [0.68, 0.15, 258], fill: [0.48, 0.17, 262] },
  { key: 'iris', name: 'Iris', family: 'violet', text: [0.72, 0.15, 298], fill: [0.48, 0.2, 296] },
  { key: 'orchid', name: 'Orchid', family: 'magenta', text: [0.76, 0.18, 345] },
  { key: 'blush', name: 'Blush', family: 'pink', text: [0.87, 0.07, 5] },
] as const satisfies readonly {
  key: string
  name: string
  family: string
  text: readonly [number, number, number]
  fill?: readonly [number, number, number]
}[]

export type PlayerColour = (typeof PLAYER_COLOURS)[number]

/** How a side draws in its colour: text and lines, the fill of its controls, and the ink on that fill. */
export type SideColour = { text: string; fill: string; ink: string }

export const isPlayerColour = (key: unknown): key is PlayerColour['key'] => PLAYER_COLOURS.some((colour) => colour.key === key)

/** FNV-1a: tiny, stable across engines, and spreads similar ids apart. */
function hash(text: string) {
  let value = 0x811c9dc5
  for (let at = 0; at < text.length; at++) {
    value ^= text.charCodeAt(at)
    value = Math.imul(value, 0x01000193)
  }
  return value >>> 0
}

type Coloured = { id: string; colour?: string | null }

export function playerColour({ id, colour }: Coloured): PlayerColour {
  return PLAYER_COLOURS.find((each) => each.key === colour) ?? PLAYER_COLOURS[hash(id) % PLAYER_COLOURS.length]!
}

const oklch = ([l, c, h]: readonly [number, number, number]) => `oklch(${l} ${c} ${h})`

export function sideColour(colour: PlayerColour): SideColour {
  const fill = 'fill' in colour ? colour.fill : undefined
  return {
    text: oklch(colour.text),
    fill: oklch(fill ?? colour.text),
    ink: fill ? 'var(--color-bone)' : 'var(--color-void)',
  }
}

/** Distance in OKLab between text forms, where equal steps look about equally different. */
function apart(one: PlayerColour, other: PlayerColour) {
  const lab = ([l, c, h]: readonly [number, number, number]) => [l, c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)]
  const [a, b] = [lab(one.text), lab(other.text)]
  return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!)
}

/**
 * The two side colours for a table led by these players, or null to keep the stock
 * red and blue while a side is still empty.
 *
 * When both captains' colours are of one family, such as two blues, the first side keeps
 * its colour and the second takes the palette colour furthest from it, so every device
 * still agrees on who is which.
 */
export function sideColours(captains: readonly [Coloured | undefined, Coloured | undefined]): [SideColour, SideColour] | null {
  const [first, second] = captains
  if (!first?.id || !second?.id) return null
  const a = playerColour(first)
  let b: PlayerColour = playerColour(second)
  if (a.family === b.family) b = PLAYER_COLOURS.reduce<PlayerColour>((best, each) => (apart(a, each) > apart(a, best) ? each : best), b)
  return [sideColour(a), sideColour(b)]
}

/** The side tokens a battle surface sets, so every tint under it draws in the players' colours. */
export function sideVariables([a, b]: readonly [SideColour, SideColour]): Record<string, string> {
  return {
    '--color-side-a': a.text,
    '--color-side-a-fill': a.fill,
    '--color-side-a-ink': a.ink,
    '--color-side-b': b.text,
    '--color-side-b-fill': b.fill,
    '--color-side-b-ink': b.ink,
  }
}
