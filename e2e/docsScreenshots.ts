import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { Locator } from '@playwright/test'
import { SCREENSHOT_SCALE, screenshotSizesJson } from '../src/client/features/docs/screenshotSizes'
import { test } from './test'

const DIRECTORY = 'src/client/features/docs/screenshots'

/**
 * Docs screenshot specs overwrite committed images, so they run only when asked:
 * `DOCS_SCREENSHOTS=1 pnpm exec playwright test e2e/docs-screenshots`.
 */
export function docsScreenshots() {
  test.skip(!process.env.DOCS_SCREENSHOTS, 'Set DOCS_SCREENSHOTS=1 to regenerate docs screenshots')
  test.use({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: SCREENSHOT_SCALE })
}

/**
 * Saves `frame` as the docs screenshot `name`, outlining `highlight` in Field Green
 * so the image shows which control the doc is pointing at. `padded` adds room around
 * a frame whose controls sit flush with its edge, where the outline would be cut off.
 */
export async function capture(name: string, frame: Locator, highlight?: Locator, { padded = false } = {}) {
  await frame.scrollIntoViewIfNeeded()
  if (padded) await frame.evaluate((element) => ((element as HTMLElement).style.padding = '12px'))
  if (highlight) await highlight.evaluate((element) => element.setAttribute('data-docs-highlight', ''))
  await frame.screenshot({
    path: `${DIRECTORY}/${name}.png`,
    animations: 'disabled',
    caret: 'hide',
    style: '[data-docs-highlight] { outline: 2px solid var(--color-parchment) !important; outline-offset: 3px !important; }',
  })
  if (highlight) await highlight.evaluate((element) => element.removeAttribute('data-docs-highlight'))
  if (padded) await frame.evaluate((element) => ((element as HTMLElement).style.padding = ''))
  // Rebuilt from every file on disk, so parallel workers each write the complete set.
  const files = readdirSync(DIRECTORY).filter((file) => file.endsWith('.png'))
  writeFileSync(
    `${DIRECTORY}/sizes.json`,
    screenshotSizesJson(files.map((file) => [file.slice(0, -'.png'.length), readFileSync(`${DIRECTORY}/${file}`)])),
  )
}
