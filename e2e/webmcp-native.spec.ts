import { expect, test } from '@playwright/test'
import { signUp, uniqueName } from './account'

test.use({ launchOptions: { args: ['--enable-blink-features=WebMCP,WebMCPTesting'] } })

type NativeContext = {
  getTools: () => Promise<{ name: string }[]>
  executeTool: (tool: { name: string }, input: string) => Promise<string>
}

function nativeTools() {
  return (document as Document & { modelContext: NativeContext }).modelContext.getTools()
}

test('the native browser API registers, executes and removes Praetorium tools', async ({ page }) => {
  await page.goto('/')
  expect(await page.evaluate(() => typeof (document as Document & { modelContext?: NativeContext }).modelContext)).toBe('object')
  await expect.poll(() => page.evaluate(nativeTools)).toHaveLength(10)
  await signUp(page, uniqueName('Native agent'))
  await expect.poll(() => page.evaluate(nativeTools)).toHaveLength(18)
  const result = await page.evaluate(async () => {
    const context = (document as Document & { modelContext: NativeContext }).modelContext
    const tool = (await context.getTools()).find((entry) => entry.name === 'list_my_rosters')!
    // The pinned Chromium 151 accepts JSON-string inputs; object inputs arrive in Chrome 155.
    return JSON.parse(await context.executeTool(tool, '{}'))
  })
  expect(result.structuredContent.rosters).toEqual([])
  await page
    .locator('[data-web-app-chrome]')
    .getByRole('button', { name: /Account menu for/ })
    .click()
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click()
  await expect.poll(() => page.evaluate(nativeTools)).toHaveLength(10)
})
