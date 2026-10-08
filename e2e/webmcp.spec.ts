import { expect, test, type Page } from '@playwright/test'
import { signUp, uniqueName } from './account'

async function installInspector(page: Page) {
  await page.addInitScript(() => {
    const tools = new Map<string, { execute: (input: object, options: { signal: AbortSignal }) => Promise<unknown> }>()
    const results: unknown[] = []
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: {
        registerTool: async (
          tool: { name: string; execute: (input: object, options: { signal: AbortSignal }) => Promise<unknown> },
          options: { signal: AbortSignal },
        ) => {
          if (options.signal.aborted) return
          tools.set(tool.name, tool)
          options.signal.addEventListener('abort', () => tools.delete(tool.name), { once: true })
        },
      },
    })
    Object.assign(window, {
      agentInspector: {
        names: () => [...tools.keys()].sort(),
        call: (name: string, input: object) => tools.get(name)!.execute(input, { signal: new AbortController().signal }),
        start: (name: string, input: object) => {
          void tools
            .get(name)!
            .execute(input, { signal: new AbortController().signal })
            .then((result) => results.push(result))
        },
        results,
      },
    })
  })
}

function names(page: Page) {
  return page.evaluate(() => (window as unknown as { agentInspector: { names: () => string[] } }).agentInspector.names())
}
function call(page: Page, toolName: string, arguments_: object = {}) {
  return page.evaluate(
    ({ name, input }) =>
      (
        window as unknown as {
          agentInspector: {
            call: (name: string, input: object) => Promise<{ structuredContent?: Record<string, unknown>; isError?: boolean }>
          }
        }
      ).agentInspector.call(name, input),
    { name: toolName, input: arguments_ },
  )
}
function start(page: Page, toolName: string, arguments_: object) {
  return page.evaluate(
    ({ name, input }) =>
      (window as unknown as { agentInspector: { start: (name: string, input: object) => void } }).agentInspector.start(name, input),
    { name: toolName, input: arguments_ },
  )
}

// The inspector stands in for browser discovery; every tool executes against the real isolated server.
test('browser agents discover the full MCP surface and account tools disappear on sign-out', async ({ page }) => {
  await installInspector(page)
  await page.goto('/')
  await expect.poll(() => names(page)).toHaveLength(11)
  await signUp(page, uniqueName('Agent'))
  await expect.poll(() => names(page)).toHaveLength(19)
  const factions = await call(page, 'list_factions')
  expect(factions.structuredContent?.factions).toBeInstanceOf(Array)
  await page
    .locator('[data-web-app-chrome]')
    .getByRole('button', { name: /Account menu for/ })
    .click()
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click()
  await expect.poll(() => names(page)).toHaveLength(11)
})

test('declining a browser-agent write leaves saved data unchanged; approving writes and refreshes the screen', async ({ page }) => {
  await installInspector(page)
  await signUp(page, uniqueName('Approval'))
  await page.goto('/battles')
  await expect.poll(() => names(page)).toHaveLength(19)
  const before = await call(page, 'list_my_battles')
  await start(page, 'create_battle', { opponentId: 'practice-opponent-1', limit: 2000 })
  const dialog = page.getByRole('dialog', { name: 'Create a battle' })
  await expect(dialog).toBeVisible()
  await page.screenshot({ path: 'test-results/webmcp-approval-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'test-results/webmcp-approval-phone.png' })
  await dialog.getByRole('button', { name: 'Decline', exact: true }).click()
  expect(await call(page, 'list_my_battles')).toEqual(before)
  await start(page, 'create_battle', { opponentId: 'practice-opponent-1', limit: 2000 })
  await dialog.getByRole('button', { name: 'Approve change', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('link', { name: /Practice Opponent/ }).first()).toBeVisible()
  const after = await call(page, 'list_my_battles')
  expect(after).not.toEqual(before)
  await page.reload()
  await expect(page.getByRole('link', { name: /Practice Opponent/ }).first()).toBeVisible()
})

test('browser agents save rosters, change visibility and append battle actions through the shared handlers', async ({ page }) => {
  await installInspector(page)
  await signUp(page, uniqueName('Agent writes'))
  await expect.poll(() => names(page)).toHaveLength(19)
  const factions = (await call(page, 'list_factions')).structuredContent!.factions as { id: string }[]
  await start(page, 'save_roster', {
    name: 'Agent army',
    catalogueId: factions[0].id,
    detachmentIds: [],
    disposition: null,
    limit: 2000,
    picks: [],
    prep: null,
  })
  const rosterDialog = page.getByRole('dialog', { name: 'Create or edit my roster' })
  await expect(rosterDialog).toContainText('Visibility: private')
  await rosterDialog.getByRole('button', { name: 'Approve change', exact: true }).click()
  await expect(rosterDialog).toBeHidden()
  const rosters = (await call(page, 'list_my_rosters')).structuredContent!.rosters as { id: string; name: string }[]
  expect(rosters.map((roster) => roster.name)).toEqual(['Agent army'])
  await start(page, 'set_roster_visibility', { id: rosters[0].id, visibility: 'public' })
  const visibilityDialog = page.getByRole('dialog', { name: 'Change my roster visibility' })
  await expect(visibilityDialog).toContainText('Make “Agent army” public.')
  await visibilityDialog.getByRole('button', { name: 'Approve change', exact: true }).click()
  await expect(visibilityDialog).toBeHidden()
  const roster = (await call(page, 'get_my_roster', { id: rosters[0].id })).structuredContent!.roster as { visibility: string }
  expect(roster.visibility).toBe('public')
  await start(page, 'create_battle', { opponentId: 'practice-opponent-1', limit: 2000 })
  const createDialog = page.getByRole('dialog', { name: 'Create a battle' })
  await createDialog.getByRole('button', { name: 'Approve change', exact: true }).click()
  await expect(createDialog).toBeHidden()
  const battles = (await call(page, 'list_my_battles')).structuredContent!.battles as { token: string }[]
  const token = battles[0].token
  const battle = (await call(page, 'get_my_battle', { token })).structuredContent!.battle as { view: { seq: number } }
  await start(page, 'submit_battle_action', { token, expectedSeq: battle.view.seq, command: { kind: 'set-painted', painted: true } })
  const actionDialog = page.getByRole('dialog', { name: 'Record a battle action' })
  await actionDialog.getByRole('button', { name: 'Approve change', exact: true }).click()
  await expect(actionDialog).toBeHidden()
  const changed = (await call(page, 'get_my_battle', { token })).structuredContent!.battle as { view: { seq: number } }
  expect(changed.view.seq).toBe(battle.view.seq + 1)
})

test('an unanswered browser-agent approval expires without saving', async ({ page }) => {
  await installInspector(page)
  await signUp(page, uniqueName('Agent timeout'))
  await expect.poll(() => names(page)).toHaveLength(19)
  const before = await call(page, 'list_my_battles')
  await page.clock.install()
  await start(page, 'create_battle', { opponentId: 'practice-opponent-1', limit: 2000 })
  const dialog = page.getByRole('dialog', { name: 'Create a battle' })
  await expect(dialog).toBeVisible()
  await page.clock.fastForward(120_001)
  await expect(dialog).toBeHidden()
  expect(await call(page, 'list_my_battles')).toEqual(before)
})
