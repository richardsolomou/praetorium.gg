import { expect, test } from '@playwright/test'
import { confirmRosterSetup, retryUntilVisible, signUp, waitForRosterSave } from './account'
import { productOperator, withAuthSql } from './storage'

for (const width of [390, 1440]) {
  test(`preserved rules remain explicit and conversion is optional at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const { email } = await signUp(page, 'Retained')
    const user = await withAuthSql(
      (database) => database.prepare('SELECT id FROM user WHERE email = ? LIMIT 1').get(email) as { id: string } | undefined,
    )
    if (!user) throw new Error('The signed-up player is missing.')
    const id = crypto.randomUUID()
    const picks = [{ entryId: '3c0a-10a9-8f84-26a3', models: 5, spreads: { 'd0cd-b8dc-82e-5eb8': { '5173-cc7b-b53a-514': 2 } } }]
    const operator = await productOperator()
    await operator.saveRoster({
      id,
      userId: user.id,
      name: 'Preserved Scouts',
      catalogueId: '470a-6daa-9014-12df',
      detachmentId: JSON.stringify(['9d23-833a-17cb-2d7d']),
      disposition: 'priority-assets',
      limit: 1000,
      picks: JSON.stringify(picks),
      prep: null,
      tags: '[]',
      waivedRules: '[]',
      visibility: 'private',
      source: 'editable',
      now: Date.now(),
    })
    await page.goto(`/rosters/${id}`)
    const notice = page.locator('[data-roster-rules-notice]')
    await expect(notice).toContainText('This roster uses MFM 1.4 · 30 Sep 2026.')
    await expect(page.locator('[data-unit="Scout Squad"]')).toContainText('Combat Knife')
    await notice.getByRole('button', { name: 'Convert rules version' }).click()
    const dialog = page.getByRole('dialog', { name: 'Convert rules version' })
    await expect(dialog.getByRole('combobox', { name: 'Rules version' })).toContainText('MFM 1.4 · 30 Sep 2026')
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.reload()
    await expect(notice).toBeVisible()
    expect((await operator.roster(id))?.picks).toBe(JSON.stringify(picks))
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    await page.screenshot({ path: `test-results/retained-roster-${width}.png`, fullPage: true })
    await notice.getByRole('button', { name: 'Convert rules version' }).click()
    await dialog.getByRole('combobox', { name: 'Rules version' }).click()
    await expect(page.getByRole('option').first()).toHaveText('Current Space Marines codex · 3 Oct 2026')
    await page.getByRole('option', { name: 'Space Marines codex · 3 Oct 2026 · Current', exact: true }).click()
    await expect(dialog.getByRole('button', { name: 'Convert roster', exact: true })).toBeEnabled()
    await waitForRosterSave(page, () => confirmRosterSetup(dialog), 'current-rosters~')
    await page.reload()
    await expect(notice).toHaveCount(0)
    expect((await operator.roster(id))?.catalogueId).toBe('current-rosters~470a-6daa-9014-12df')
    await expect(
      page.getByText('Scout Squad: a saved choice is no longer available; reselect this unit’s options', { exact: true }),
    ).toBeVisible()
    await page.screenshot({ path: `test-results/converted-roster-${width}.png`, fullPage: true })
  })
}

test('converts a retired Marine faction identity without discarding its generated units', async ({ page }) => {
  const { email } = await signUp(page, 'Original Marines')
  const user = await withAuthSql((database) => database.prepare('SELECT id FROM user WHERE email = ? LIMIT 1').get(email) as { id: string })
  const id = crypto.randomUUID()
  const operator = await productOperator()
  await operator.saveRoster({
    id,
    userId: user.id,
    name: 'Original Ultramarines',
    catalogueId: 'a603-5039-f08d-e841',
    detachmentId: JSON.stringify(['profile-detachment-option-a603-5039-f08d-e841-f367-3240-47c1-7e1a']),
    disposition: 'take-and-hold',
    limit: 1000,
    picks: JSON.stringify([{ entryId: 'profile-unit-a603-5039-f08d-e841-5302-e1f9-0338-76f9' }]),
    prep: null,
    tags: '[]',
    waivedRules: '[]',
    visibility: 'private',
    source: 'editable',
    now: Date.now(),
  })
  await page.goto(`/rosters/${id}`)
  const notice = page.locator('[data-roster-rules-notice]')
  const dialog = page.getByRole('dialog', { name: 'Convert rules version' })
  await retryUntilVisible(dialog, () => notice.getByRole('button', { name: 'Convert rules version' }).click())
  await dialog.getByRole('combobox', { name: 'Rules version' }).click()
  await page.getByRole('option', { name: 'MFM 1.5 · Current', exact: true }).click()
  await dialog.getByRole('button', { name: 'Remove unavailable', exact: true }).click()
  await dialog.getByRole('button', { name: 'Select Gladius Task Force', exact: true }).click()
  const dispositions = dialog.getByRole('group', { name: 'Force disposition' }).getByRole('button')
  if ((await dispositions.count()) > 1) await dispositions.first().click()
  await waitForRosterSave(page, () => confirmRosterSetup(dialog), '4029-9237-e8db-af55')
  await page.reload()
  await expect(notice).toHaveCount(0)
  expect(JSON.parse((await operator.roster(id))!.picks)).toEqual([{ entryId: '984d-c25b-86dd-9970' }])
})
