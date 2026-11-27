import { test, type Locator, type Page, type PageScreenshotOptions } from '@playwright/test'

/**
 * Saves a design screenshot as `name` in the test's output folder for a person to look at. CI throws a passing
 * test's output away and keeps a failing one's trace, so there it only waits for the element it would have shown.
 */
export async function screenshot(target: Page | Locator, name: string, options: Omit<PageScreenshotOptions, 'path'> = {}) {
  if (!process.env.CI) await target.screenshot({ ...options, path: test.info().outputPath(name) })
  else if ('waitFor' in target) await target.waitFor()
}
