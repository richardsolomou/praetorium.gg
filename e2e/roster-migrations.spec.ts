import { expect, test } from './test'
import { confirmRosterSetup, retryUntilVisible, signUp, waitForRosterSave } from './account'
import { productOperator, withAuthSql } from './storage'

test('preserved rules remain explicit and conversion is optional', { tag: '@catalogue' }, async ({ page }) => {
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
    // Saved before the app served MFM 1.5, so its MFM 1.4 gear keeps it on MFM 1.4.
    now: Date.UTC(2026, 8, 20),
  })
  await page.goto(`/rosters/${id}`)
  const notice = page.locator('[data-roster-rules-notice]')
  const dialog = page.getByRole('dialog', { name: 'Convert rules version' })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(notice).toContainText('This roster uses MFM 1.4.')
    await expect(page.locator('[data-unit="Scout Squad"]')).toContainText('Combat Knife')
    await notice.getByRole('button', { name: 'Convert rules version' }).click()
    await expect(dialog.getByRole('combobox', { name: 'Rules version' })).toContainText('MFM 1.4')
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(dialog).toBeHidden()
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.reload()
  await expect(notice).toBeVisible()
  expect((await operator.roster(id))?.picks).toBe(JSON.stringify(picks))
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    await page.screenshot({ path: `test-results/retained-roster-${width}.png`, fullPage: true })
  }
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await notice.getByRole('button', { name: 'Convert rules version' }).click()
    await dialog.getByRole('combobox', { name: 'Rules version' }).click()
    await expect(page.getByRole('option').first()).toHaveText('Current MFM 1.6')
    await page.getByRole('option', { name: 'MFM 1.6 · Current', exact: true }).click()
    await expect(dialog.getByRole('button', { name: 'Convert roster', exact: true })).toBeEnabled()
    if (width === 390) {
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
      await expect(dialog).toBeHidden()
    }
  }
  await waitForRosterSave(page, () => confirmRosterSetup(dialog), 'mfm-1-6~')
  await page.reload()
  await expect(notice).toHaveCount(0)
  expect((await operator.roster(id))?.catalogueId).toBe('mfm-1-6~470a-6daa-9014-12df')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(
      page.getByText('Scout Squad: a saved choice is no longer available; reselect this unit’s options', { exact: true }),
    ).toBeVisible()
    await page.screenshot({ path: `test-results/converted-roster-${width}.png`, fullPage: true })
  }
})

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
    // Saved before the app served the codex, so its profile-era books keep it on the pre-codex rules.
    now: Date.UTC(2026, 8, 20),
  })
  await page.goto(`/rosters/${id}`)
  const notice = page.locator('[data-roster-rules-notice]')
  const dialog = page.getByRole('dialog', { name: 'Convert rules version' })
  await retryUntilVisible(dialog, () => notice.getByRole('button', { name: 'Convert rules version' }).click())
  await dialog.getByRole('combobox', { name: 'Rules version' }).click()
  await page.getByRole('option', { name: 'MFM 1.6 · Current', exact: true }).click()
  await dialog.getByRole('button', { name: 'Remove unavailable', exact: true }).click()
  await dialog.getByRole('button', { name: 'Select Gladius Task Force', exact: true }).click()
  const dispositions = dialog.getByRole('group', { name: 'Force disposition' }).getByRole('button')
  if ((await dispositions.count()) > 1) await dispositions.first().click()
  await waitForRosterSave(page, () => confirmRosterSetup(dialog), '4029-9237-e8db-af55')
  await page.reload()
  await expect(notice).toHaveCount(0)
  expect(JSON.parse((await operator.roster(id))!.picks)).toEqual([{ entryId: '984d-c25b-86dd-9970' }])
})

test('library and builder point a roster on earlier released rules at the current version', { tag: '@catalogue' }, async ({ page }) => {
  const { email } = await signUp(page, 'Earlier Rules')
  const user = await withAuthSql((database) => database.prepare('SELECT id FROM user WHERE email = ? LIMIT 1').get(email) as { id: string })
  const operator = await productOperator()
  const picks = JSON.stringify([{ entryId: '3c0a-10a9-8f84-26a3', models: 5 }])
  const save = (name: string, catalogueId: string) => {
    const id = crypto.randomUUID()
    return operator
      .saveRoster({
        id,
        userId: user.id,
        name,
        catalogueId,
        detachmentId: JSON.stringify(['9d23-833a-17cb-2d7d']),
        disposition: 'priority-assets',
        limit: 1000,
        picks,
        prep: null,
        tags: '[]',
        waivedRules: '[]',
        visibility: 'private',
        source: 'editable',
        now: Date.now(),
      })
      .then(() => id)
  }
  const earlier = await save('Earlier Scouts', 'legacy-rosters~470a-6daa-9014-12df')
  await save('Current Scouts', 'mfm-1-6~470a-6daa-9014-12df')
  await page.goto('/rosters')
  await expect(page.locator('[data-roster="Earlier Scouts"]')).toContainText('Older rules')
  await expect(page.locator('[data-roster="Current Scouts"]')).toContainText('11th edition')
  await expect(page.locator('[data-roster="Current Scouts"]')).not.toContainText('Older rules')
  await page.getByRole('link', { name: '1 roster uses older rules', exact: true }).click()
  await expect(page).toHaveURL(/updates=older/)
  await expect(page.locator('[data-roster="Current Scouts"]')).toHaveCount(0)
  await expect(page.locator('[data-roster="Earlier Scouts"]')).toBeVisible()
  await page.goto(`/rosters/${earlier}`)
  const notice = page.locator('[data-roster-rules-notice]')
  await expect(notice).toContainText('This roster uses MFM 1.4. MFM 1.6 is the current rules version.')
  const dialog = page.getByRole('dialog', { name: 'Convert rules version' })
  await retryUntilVisible(dialog, () => notice.getByRole('button', { name: 'Convert rules version' }).click())
  await dialog.getByRole('combobox', { name: 'Rules version' }).click()
  await page.getByRole('option', { name: 'MFM 1.6 · Current', exact: true }).click()
  await dialog.getByRole('button', { name: 'Convert roster', exact: true }).click()
  const review = page.getByRole('dialog', { name: 'Review roster changes' })
  await expect(review.getByLabel('Roster change preview')).toContainText(/Scout Squad · 5 models · [\d →]+ pts/)
  await review.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect((await operator.roster(earlier))?.catalogueId).toBe('legacy-rosters~470a-6daa-9014-12df')
  await page.goto(`/rosters/${earlier}`)
  await retryUntilVisible(dialog, () => notice.getByRole('button', { name: 'Convert rules version' }).click())
  await dialog.getByRole('combobox', { name: 'Rules version' }).click()
  await page.getByRole('option', { name: 'MFM 1.6 · Current', exact: true }).click()
  await dialog.getByRole('button', { name: 'Convert roster', exact: true }).click()
  await review.getByRole('switch', { name: /Keep the original/ }).click()
  await review.getByRole('button', { name: 'Confirm changes', exact: true }).click()
  await expect(page).not.toHaveURL(new RegExp(earlier))
  const variant = new URL(page.url()).pathname.split('/').at(-1)!
  expect((await operator.roster(earlier))?.catalogueId).toBe('legacy-rosters~470a-6daa-9014-12df')
  expect(await operator.roster(variant)).toMatchObject({ catalogueId: 'mfm-1-6~470a-6daa-9014-12df', baseRosterId: earlier })
  await expect(notice).toHaveCount(0)
  await page.goto('/rosters')
  await expect(page.locator('[data-roster="Earlier Scouts"]')).toContainText('Older rules')
  await expect(page.locator('[data-roster="Earlier Scouts · 2"]')).not.toContainText('Older rules')
})

test('resets a saved choice the current rules no longer offer', async ({ page }) => {
  const { email } = await signUp(page, 'Stale choice')
  const user = await withAuthSql((database) => database.prepare('SELECT id FROM user WHERE email = ? LIMIT 1').get(email) as { id: string })
  const id = crypto.randomUUID()
  const operator = await productOperator()
  await operator.saveRoster({
    id,
    userId: user.id,
    name: 'Stale Scouts',
    catalogueId: 'mfm-1-6~470a-6daa-9014-12df',
    detachmentId: JSON.stringify(['9d23-833a-17cb-2d7d']),
    disposition: 'priority-assets',
    limit: 1000,
    picks: JSON.stringify([{ entryId: '3c0a-10a9-8f84-26a3', models: 5, choices: { 'retired-group': 'retired-option' } }]),
    prep: null,
    tags: '[]',
    waivedRules: '[]',
    visibility: 'private',
    source: 'editable',
    now: Date.now(),
  })
  // Opened straight from its address, so the edit can land before this device has downloaded the roster.
  await page.goto(`/rosters/${id}`)
  const error = page.getByRole('listitem').filter({ hasText: 'Scout Squad: a saved choice is no longer available' })
  await expect(error).toBeVisible()
  await waitForRosterSave(page, () => error.getByRole('button', { name: 'Reset options', exact: true }).click())
  await expect(error).toHaveCount(0)
  await page.reload()
  await expect(error).toHaveCount(0)
  const [saved] = JSON.parse((await operator.roster(id))?.picks ?? '[]') as { models?: number; choices?: Record<string, string> }[]
  expect(saved?.choices?.['retired-group']).toBeUndefined()
  expect(saved?.models).toBe(5)
})
