import { expect, test } from './test'
import { savedArmy, nextFrames } from './account'
import { chooseRosterUnit, openRosterList, simulatorState } from './combat'

for (const choice of ['other side', 'same side', 'example'] as const)
  test(`a delayed roster read preserves the newer ${choice} selection`, async ({ page }) => {
    await page.addInitScript(() => {
      window.requestIdleCallback = () => 0
    })
    const { id, userId, operator } = await savedArmy(page, 'Roster selection', { name: 'First selection' })
    const source = (await operator.roster(id))!
    const second = crypto.randomUUID()
    await operator.saveRoster({ ...source, userId, id: second, name: 'Second selection', now: Date.now() })
    await page.goto('/simulator')
    const firstRoster = page.getByLabel('Attacker roster', { exact: true })
    const secondRoster = page.getByLabel('Defender roster', { exact: true })
    const { promise: gate, resolve: release } = Promise.withResolvers<void>()
    let started = false
    await page.route('**/_serverFn/**', async (route) => {
      if ((decodeURIComponent(route.request().url()) + (route.request().postData() ?? '')).includes(id)) {
        started = true
        await gate
      }
      await route.continue()
    })
    try {
      const delayedReply = page.waitForResponse((response) => decodeURIComponent(response.url()).includes(id))
      await openRosterList(page, 'Attacker')
      await page.getByRole('option', { name: /First selection/ }).click()
      await expect.poll(() => started).toBe(true)
      if (choice === 'same side') {
        await page.getByRole('button', { name: 'Rosters', exact: true }).click()
        await page.getByRole('option', { name: /Second selection/ }).click()
        await page.getByRole('listbox').getByRole('option').first().click()
        await expect(firstRoster).toContainText('Second selection')
      } else {
        await page.keyboard.press('Escape')
        if (choice === 'example') {
          await page.getByRole('button', { name: 'Try an example', exact: true }).click()
          await expect(page.getByRole('region', { name: 'Attacker', exact: true })).toContainText('Intercessor Squad')
        } else {
          await chooseRosterUnit(page, 'Defender', /Second selection/)
          await expect(secondRoster).toContainText('Second selection')
        }
      }
      release()
      await (await delayedReply).finished()
      await page.unrouteAll({ behavior: 'wait' })
      await nextFrames(page)
      const expected = choice === 'other side' ? [null, second] : choice === 'same side' ? [second, null] : [null, null]
      const selected = () => {
        const state = simulatorState(page)
        return state?.sides.map((side) => side?.roster?.id ?? null)
      }
      await expect.poll(selected).toEqual(expected)
      await page.screenshot({ path: test.info().outputPath(`roster-${choice.replace(' ', '-')}.png`), fullPage: true })
      await page.reload()
      await expect.poll(selected).toEqual(expected)
      if (choice === 'other side') await expect(secondRoster).toContainText('Second selection')
      if (choice === 'same side') await expect(firstRoster).toContainText('Second selection')
      if (choice === 'example') await expect(page.getByRole('region', { name: 'Attacker', exact: true })).toContainText('Intercessor Squad')
    } finally {
      release()
      await page.unrouteAll({ behavior: 'wait' })
    }
  })
