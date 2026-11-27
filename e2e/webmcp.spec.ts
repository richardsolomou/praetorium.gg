import { expect, test, type Page } from './test'
import mcpSurface from '../src/server/mcpSurface.json' with { type: 'json' }
import { signUp, uniqueName, PHONE } from './account'

import { call, installInspector, names } from './webmcpInspector'
import { screenshot } from './screenshots'

/** The token the latest approved create_battle answered with. */
function createdToken(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as { agentInspector: { results: { structuredContent?: { token?: string } }[] } }).agentInspector.results.at(-1)
        ?.structuredContent?.token,
  )
}
function start(page: Page, toolName: string, arguments_: object) {
  return page.evaluate(
    ({ name, input }) =>
      (window as unknown as { agentInspector: { start: (name: string, input: object) => void } }).agentInspector.start(name, input),
    { name: toolName, input: arguments_ },
  )
}

test('a browser assistant joins another player’s draft only after approval', async ({ page, browser }) => {
  const host = uniqueName('Host')
  await installInspector(page)
  await signUp(page, host)
  await page.goto('/battles')
  await expect.poll(() => names(page)).toContain('create_battle')
  const draft = call(page, 'create_battle')
  await page.getByRole('dialog', { name: 'Create a battle' }).getByRole('button', { name: 'Approve change' }).click()
  const created = (await draft).structuredContent as { token: string; joinUrl: string }
  const invite = decodeURIComponent(new URL(created.joinUrl, page.url()).pathname.split('/').at(-1)!)

  const visitor = await (await browser.newContext()).newPage()
  await installInspector(visitor)
  await signUp(visitor, uniqueName('Invitee'))
  await visitor.goto('/battles')
  await expect.poll(() => names(visitor)).toContain('join_battle')
  const info = await call(visitor, 'get_battle_invite', { invite })
  expect(info.structuredContent).toMatchObject({ hostName: host, token: null })

  const joining = call(visitor, 'join_battle', { invite, side: 1 })
  const approval = visitor.getByRole('dialog', { name: 'Join a battle from an invite' })
  await expect(approval.getByText(`Join ${host}’s battle on side 2.`)).toBeVisible()
  await screenshot(visitor, 'join-battle-approval.png')
  await approval.getByRole('button', { name: 'Approve change' }).click()
  expect((await joining).structuredContent).toMatchObject({ token: created.token })
  expect((await call(visitor, 'get_my_battle', { token: created.token })).isError).not.toBe(true)
})

test('declining a browser-agent write leaves saved data unchanged; approving writes and refreshes the screen', async ({ page }) => {
  await installInspector(page)
  await signUp(page, uniqueName('Approval'))
  await page.goto('/battles')
  await expect.poll(() => names(page)).toHaveLength(Object.keys(mcpSurface).length + 4)
  // A battle played alone stays a draft until its armies are chosen, which Battles offers back.
  const draft = page.getByRole('link', { name: /Continue your draft.* vs Opponent/ })
  await start(page, 'create_battle', { bothSides: true })
  const dialog = page.getByRole('dialog', { name: 'Create a battle' })
  await expect(dialog).toBeVisible()
  await screenshot(page, 'webmcp-approval-desktop.png')
  await page.setViewportSize(PHONE)
  await screenshot(page, 'webmcp-approval-phone.png')
  await dialog.getByRole('button', { name: 'Decline', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Battles', exact: true })).toBeVisible()
  await expect(draft).toHaveCount(0)
  await expect.poll(() => names(page)).toHaveLength(Object.keys(mcpSurface).length + 4)
  await start(page, 'create_battle', { bothSides: true })
  await dialog.getByRole('button', { name: 'Approve change', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(draft).toBeVisible()
  await page.reload()
  await expect(draft).toBeVisible()
})

test('browser agents save rosters, change visibility and append battle actions through the shared handlers', async ({ page }) => {
  await installInspector(page)
  await signUp(page, uniqueName('Agent writes'))
  await page.goto('/')
  await expect.poll(() => names(page)).toHaveLength(Object.keys(mcpSurface).length + 4)
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
  await start(page, 'create_battle', { bothSides: true })
  const createDialog = page.getByRole('dialog', { name: 'Create a battle' })
  await createDialog.getByRole('button', { name: 'Approve change', exact: true }).click()
  await expect(createDialog).toBeHidden()
  // Played alone, the battle stays a draft until its armies are in, so it is read from the tool's own answer.
  await expect.poll(() => createdToken(page)).toBeTruthy()
  const token = (await createdToken(page))!
  const battle = (await call(page, 'get_my_battle', { token })).structuredContent!.battle as { view: { seq: number } }
  await start(page, 'submit_battle_action', { token, expectedSeq: battle.view.seq, command: { kind: 'set-painted', painted: true } })
  const actionDialog = page.getByRole('dialog', { name: 'Record a battle action' })
  await actionDialog.getByRole('button', { name: 'Approve change', exact: true }).click()
  await expect(actionDialog).toBeHidden()
  const changed = (await call(page, 'get_my_battle', { token })).structuredContent!.battle as { view: { seq: number } }
  expect(changed.view.seq).toBe(battle.view.seq + 1)
})

test('browser agents import a collection that exceeds the standard tool request size', async ({ page }) => {
  await installInspector(page)
  await signUp(page, uniqueName('Large collection'))
  await page.goto('/')
  await expect.poll(() => names(page)).toContain('import_collection')
  const rows = Array.from({ length: 800 }, (_, index) => ({
    entryId: `70f49209-98f3-4307-9ced-${String(index).padStart(12, '0')}`,
    models: 5,
    built: 3,
    painted: 2,
    wanted: 0,
  }))
  const importing = call(page, 'import_collection', { rows, replace: true })
  const approval = page.getByRole('dialog', { name: 'Import multiple collection entries' })
  await expect(approval.getByText('Import 800 entries and overwrite matching collection counts.')).toBeVisible()
  await expect(approval.locator('dl')).toHaveCount(0)
  await approval.getByText('All proposed changes').click()
  await expect(approval.locator('dl')).toContainText(rows[0].entryId)
  await approval.getByText('All proposed changes').click()
  await approval.getByRole('button', { name: 'Approve change' }).click()
  expect((await importing).structuredContent).toMatchObject({ added: 800 })
})
