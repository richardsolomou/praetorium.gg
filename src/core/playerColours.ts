/**
 * Every player's own colour: the one they chose, or one picked from their id, so it
 * reads the same on every device.
 *
 * Each colour has a text form, light enough to read at 4.5:1 or better on Panel, and
 * a fill for the controls that act for a side. Colours too dark to read as text keep a
 * deep fill under Bone ink, which is what lets greens in without their buttons passing
 * for Field Green; the rest fill with their text form under Void ink. Neighbours differ
 * in lightness or chroma as well as hue, and stay clear of Amber, Supporter Gold and Bone.
 * Colours that read alike as text share a family; a shared family, or two colours a
 * colour-blind player would see as one, is a clash.
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

const oklch = ([l, c, h]: Triple) => `oklch(${l} ${c} ${h})`

export function sideColour(colour: PlayerColour): SideColour {
  const fill = 'fill' in colour ? colour.fill : undefined
  return {
    text: oklch(colour.text),
    fill: oklch(fill ?? colour.text),
    ink: fill ? 'var(--color-bone)' : 'var(--color-void)',
  }
}

type Triple = readonly [number, number, number]

const clip = (value: number) => Math.min(1, Math.max(0, value))

function linearRgb([l, c, h]: Triple): Triple {
  const [a, b] = [c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)]
  const lms = [
    l + 0.3963377774 * a + 0.2158037573 * b,
    l - 0.1055613458 * a - 0.0638541728 * b,
    l - 0.0894841775 * a - 1.291485548 * b,
  ].map((value) => value ** 3) as [number, number, number]
  return [
    clip(4.0767416621 * lms[0] - 3.3077115913 * lms[1] + 0.2309699292 * lms[2]),
    clip(-1.2684380046 * lms[0] + 2.6097574011 * lms[1] - 0.3413193965 * lms[2]),
    clip(-0.0041960863 * lms[0] - 0.7034186147 * lms[1] + 1.707614701 * lms[2]),
  ]
}

function oklab([r, g, b]: Triple): Triple {
  const [l, m, s] = [
    0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b,
    0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b,
    0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b,
  ].map(Math.cbrt) as [number, number, number]
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

/** Full-strength protanopia, deuteranopia and tritanopia on linear sRGB (Machado, Oliveira and Fernandes, 2009), beside normal vision. */
const VISIONS: readonly (readonly [Triple, Triple, Triple])[] = [
  [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
]

const seen = (colour: PlayerColour) =>
  VISIONS.map((vision) => {
    const rgb = linearRgb(colour.text)
    return oklab(vision.map((row) => clip(row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2])) as unknown as Triple)
  })

const SEEN = new Map(PLAYER_COLOURS.map((colour) => [colour.key, seen(colour)]))

/** How far apart two text forms look in OKLab to the eye that can least tell them apart, normal or colour-blind. */
export function apart(one: PlayerColour, other: PlayerColour) {
  const [a, b] = [SEEN.get(one.key)!, SEEN.get(other.key)!]
  return Math.min(...a.map((view, index) => Math.hypot(...view.map((value, axis) => value - b[index]![axis]!))))
}

/** Below this, two colours read as one at a glance. */
export const LEAST_APART = 0.06

const clash = (one: PlayerColour, other: PlayerColour) => one.family === other.family || apart(one, other) < LEAST_APART

type Seated = Coloured & { side: number }

/**
 * Every seated player's colour for one battle, and the side tokens that draw it, or
 * null to keep the stock red and blue while a side is still empty.
 *
 * Players keep their own colour unless an earlier seat already holds one of its family,
 * such as two blues, or one that a colour-blind player could not tell from it; then they
 * take the free colour that stays furthest from every one already held to every eye. Side 0 is seated first and each side in its seat order, so every device agrees
 * on who is which. A side's single colour, for its controls and dialogs, is its first
 * player's; its blend runs through all of its players' colours.
 */
export function battleColours(players: readonly Seated[]): { players: Map<string, SideColour>; variables: Record<string, string> } | null {
  const seated = [0, 1].map((side) => players.filter((player) => player.side === side && player.id))
  if (seated.some((side) => !side.length)) return null
  const held: PlayerColour[] = []
  const colours = new Map<string, SideColour>()
  const sides = seated.map((side) =>
    side.map((player) => {
      let colour = playerColour(player)
      const free = PLAYER_COLOURS.filter((each) => !held.some((other) => clash(each, other)))
      if (free.length && !free.includes(colour)) {
        const near = (each: PlayerColour) => Math.min(...held.map((other) => apart(each, other)))
        colour = free.reduce((best, each) => (near(each) > near(best) ? each : best))
      }
      held.push(colour)
      colours.set(player.id, sideColour(colour))
      return colours.get(player.id)!
    }),
  )
  return { players: colours, variables: Object.assign({}, ...sides.map((side, index) => sideVariables(index ? 'b' : 'a', side))) }
}

/** The tokens one side sets, so every tint under it draws in its players' colours. */
function sideVariables(name: 'a' | 'b', [first, ...rest]: readonly SideColour[]): Record<string, string> {
  const stops = [first!, ...rest].map((colour) => colour.text)
  return {
    [`--color-side-${name}`]: first!.text,
    [`--color-side-${name}-fill`]: first!.fill,
    [`--color-side-${name}-ink`]: first!.ink,
    [`--side-${name}-blend`]: `linear-gradient(90deg, ${stops.length > 1 ? stops.join(', ') : `${stops[0]}, ${stops[0]}`})`,
  }
}
