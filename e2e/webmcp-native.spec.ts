import { expect, test } from './test'
import { signUp, uniqueName, signOut } from './account'

test.use({ launchOptions: { args: ['--enable-blink-features=WebMCP,WebMCPTesting'] } })

type NativeContext = {
  getTools: () => Promise<{ name: string }[]>
  executeTool: (tool: { name: string }, input: Record<string, unknown>) => Promise<string>
}

function nativeTools() {
  return (document as Document & { modelContext: NativeContext }).modelContext.getTools()
}

test('the native browser API registers, executes and removes Praetorium tools', async ({ page }) => {
  await page.goto('/')
  expect(await page.evaluate(() => typeof (document as Document & { modelContext?: NativeContext }).modelContext)).toBe('object')
  await expect.poll(() => page.evaluate(nativeTools)).toHaveLength(11)
  await signUp(page, uniqueName('Native agent'))
  await expect.poll(() => page.evaluate(nativeTools)).toHaveLength(19)
  const result = await page.evaluate(async () => {
    const context = (document as Document & { modelContext: NativeContext }).modelContext
    const tool = (await context.getTools()).find((entry) => entry.name === 'list_my_rosters')!
    return JSON.parse(await context.executeTool(tool, {}))
  })
  expect(result.structuredContent.rosters).toEqual([])
  await signOut(page)
  await expect.poll(() => page.evaluate(nativeTools)).toHaveLength(11)
})
