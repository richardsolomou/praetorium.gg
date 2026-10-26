import { expect, test, type Page } from './test'
import { confirmRosterSetup, retryUntilVisible, signUp, waitForRosterSave, expectNoPageOverflow, chooseOption } from './account'
import { lastPathSegment, seedRoster } from './storage'

/** Opens the conversion the rules notice offers and chooses the current rules version. */
async function convertToCurrentRules(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Convert rules version' })
  await retryUntilVisible(dialog, () =>
    page.locator('[data-roster-rules-notice]').getByRole('button', { name: 'Convert rules version' }).click(),
  )
  await chooseOption(page, 'Rules version', 'MFM 1.6 · Current')
}

test('fixed Sternguard equipment survives migration, saving and reload', { tag: '@catalogue' }, async ({ page }) => {
  const { email } = await signUp(page, 'Fixed equipment')
  const { id, operator } = await seedRoster(email, {
    name: 'Fixed Sternguard',
    catalogueId: 'e0af-67df-9d63-8fb7',
    detachmentId: JSON.stringify(['d2dc-693e-b491-b16d']),
    disposition: 'take-and-hold',
    limit: 2000,
    picks: JSON.stringify([
      {
        entryId: 'bc4e-8331-8179-255b',
        models: 5,
        choices: { 'edfc-d6af-480a-d5fc/97cd-6365-ce27-d73f/5ff5-aadc-6bc4-b2d8': '39c3-1657-46c8-5d87' },
        spreads: { 'edfc-d6af-480a-d5fc': { '5700-4122-349a-e5da': 4, 'afda-2132-147f-d0f1': 0 } },
      },
    ]),
  })
  await page.goto(`/rosters/${id}`)
  const unit = page.locator('[data-unit="Sternguard Veteran Squad"]')
  await expect(unit).toContainText('Artificer Firearm')
  await expect(unit).toContainText('105')
  await expect(page.getByText(/a saved choice is no longer available/)).toHaveCount(0)
  await expect(page.getByText(/a detachment that is no longer available/)).toHaveCount(0)
  await waitForRosterSave(page, () => page.getByLabel('List name').fill('Fixed Sternguard saved'), 'Fixed Sternguard saved')
  await page.reload()
  await expect(unit).toContainText('Artificer Firearm')
  await expect(unit).toContainText('105')
  expect(JSON.parse((await operator.roster(id))!.picks)).toEqual([
    {
      entryId: 'bc4e-8331-8179-255b',
      models: 5,
      choices: {},
      spreads: { 'edfc-d6af-480a-d5fc': { '5700-4122-349a-e5da': 4, 'afda-2132-147f-d0f1': 0 } },
    },
  ])
  await page.screenshot({ path: test.info().outputPath('fixed-sternguard-migrated.png'), fullPage: true })
})

test('preserved rules remain explicit and conversion is optional', { tag: '@catalogue' }, async ({ page }) => {
  const { email } = await signUp(page, 'Retained')
  const picks = [{ entryId: '3c0a-10a9-8f84-26a3', models: 5, spreads: { 'd0cd-b8dc-82e-5eb8': { '5173-cc7b-b53a-514': 2 } } }]
  const { id, operator } = await seedRoster(email, {
    name: 'Preserved Scouts',
    catalogueId: '470a-6daa-9014-12df',
    detachmentId: JSON.stringify(['9d23-833a-17cb-2d7d']),
    disposition: 'priority-assets',
    limit: 1000,
    picks: JSON.stringify(picks),
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
    await expectNoPageOverflow(page)
    await page.screenshot({ path: test.info().outputPath(`retained-roster-${width}.png`), fullPage: true })
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
    await page.screenshot({ path: test.info().outputPath(`converted-roster-${width}.png`), fullPage: true })
  }
})

test('converts a retired Marine faction identity without discarding its generated units', async ({ page }) => {
  const { email } = await signUp(page, 'Original Marines')
  const { id, operator } = await seedRoster(email, {
    name: 'Original Ultramarines',
    catalogueId: 'a603-5039-f08d-e841',
    detachmentId: JSON.stringify(['profile-detachment-option-a603-5039-f08d-e841-f367-3240-47c1-7e1a']),
    disposition: 'take-and-hold',
    limit: 1000,
    picks: JSON.stringify([{ entryId: 'profile-unit-a603-5039-f08d-e841-5302-e1f9-0338-76f9' }]),
    // Saved before the app served the codex, so its profile-era books keep it on the pre-codex rules.
    now: Date.UTC(2026, 8, 20),
  })
  await page.goto(`/rosters/${id}`)
  const notice = page.locator('[data-roster-rules-notice]')
  const dialog = page.getByRole('dialog', { name: 'Convert rules version' })
  await convertToCurrentRules(page)
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
  const picks = JSON.stringify([{ entryId: '3c0a-10a9-8f84-26a3', models: 5 }])
  const save = (name: string, catalogueId: string) =>
    seedRoster(email, {
      name,
      catalogueId,
      detachmentId: JSON.stringify(['9d23-833a-17cb-2d7d']),
      disposition: 'priority-assets',
      limit: 1000,
      picks,
    })
  const { id: earlier, operator } = await save('Earlier Scouts', 'legacy-rosters~470a-6daa-9014-12df')
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
  await convertToCurrentRules(page)
  await dialog.getByRole('button', { name: 'Convert roster', exact: true }).click()
  const review = page.getByRole('dialog', { name: 'Review roster changes' })
  await expect(review.getByLabel('Roster change preview')).toContainText(/Scout Squad · 5 models · [\d →]+ pts/)
  await review.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect((await operator.roster(earlier))?.catalogueId).toBe('legacy-rosters~470a-6daa-9014-12df')
  await page.goto(`/rosters/${earlier}`)
  await convertToCurrentRules(page)
  await dialog.getByRole('button', { name: 'Convert roster', exact: true }).click()
  await review.getByRole('switch', { name: /Keep the original/ }).click()
  await review.getByRole('button', { name: 'Confirm changes', exact: true }).click()
  await expect(page).not.toHaveURL(new RegExp(earlier))
  const variant = lastPathSegment(page.url())
  expect((await operator.roster(earlier))?.catalogueId).toBe('legacy-rosters~470a-6daa-9014-12df')
  expect(await operator.roster(variant)).toMatchObject({ catalogueId: 'mfm-1-6~470a-6daa-9014-12df', baseRosterId: earlier })
  await expect(notice).toHaveCount(0)
  await page.goto('/rosters')
  await expect(page.locator('[data-roster="Earlier Scouts"]')).toContainText('Older rules')
  await expect(page.locator('[data-roster="Earlier Scouts · 2"]')).not.toContainText('Older rules')
})

test('resets a saved choice the current rules no longer offer', async ({ page }) => {
  const { email } = await signUp(page, 'Stale choice')
  const { id, operator } = await seedRoster(email, {
    name: 'Stale Scouts',
    catalogueId: 'mfm-1-6~470a-6daa-9014-12df',
    detachmentId: JSON.stringify(['9d23-833a-17cb-2d7d']),
    disposition: 'priority-assets',
    limit: 1000,
    picks: JSON.stringify([{ entryId: '3c0a-10a9-8f84-26a3', models: 5, choices: { 'retired-group': 'retired-option' } }]),
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
