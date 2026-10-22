/** Docs screenshots are captured at this device pixel ratio and shown at their CSS size. */
export const SCREENSHOT_SCALE = 2

/** A PNG's pixel width and height, read from its IHDR chunk. */
export function pngSize(png: Uint8Array): [number, number] {
  const header = new DataView(png.buffer, png.byteOffset, png.byteLength)
  return [header.getUint32(16), header.getUint32(20)]
}

/** `screenshots/sizes.json` as the formatter writes it, so the page can reserve each image's space before it loads. */
export function screenshotSizesJson(screenshots: [name: string, png: Uint8Array][]) {
  const entries = screenshots
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([name, png]) => `  ${JSON.stringify(name)}: [${pngSize(png).join(', ')}]`)
  return `{\n${entries.join(',\n')}\n}\n`
}
