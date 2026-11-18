const FOOTPRINT = /(\d+(?:\.\d+)?)\s*(?:x\s*(\d+(?:\.\d+)?)\s*)?mm/gi
const buildable = (size: number) => size >= 15 && size <= 180

/**
 * The distinct footprints a datasheet's base size names, as HobbyKit's `#base=` link spells them: `32` for a round, `75x42` for an
 * oval. Hulls and other text without a size name none.
 */
export function baseFootprints(baseSize: string | null): string[] {
  const footprints = new Set<string>()
  for (const [, width = '', length] of (baseSize ?? '').matchAll(FOOTPRINT)) {
    if (!buildable(Number(width)) || (length !== undefined && !buildable(Number(length)))) continue
    footprints.add(length === undefined ? width : `${width}x${length}`)
  }
  return [...footprints]
}
