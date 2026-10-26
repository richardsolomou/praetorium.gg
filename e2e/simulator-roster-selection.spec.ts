import { expect, test } from './test'
import { savedArmy, nextFrames } from './account'
import { simulatorState } from './combat'

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
    const firstPicker = page.getByRole('combobox', { name: 'First roster', exact: true })
    const secondPicker = page.getByRole('combobox', { name: 'Second roster', exact: true })
    await expect(firstPicker).toBeVisible()
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
      await firstPicker.click()
      await page.getByRole('option', { name: /First selection/ }).click()
      await expect.poll(() => started).toBe(true)
      if (choice === 'example') {
        await page.getByRole('button', { name: 'Try an example', exact: true }).click()
        await expect(page.getByRole('region', { name: 'Attacker', exact: true })).toContainText('Intercessor Squad')
      } else {
        await (choice === 'other side' ? secondPicker : firstPicker).click()
        await page.getByRole('option', { name: /Second selection/ }).click()
        await expect(choice === 'other side' ? secondPicker : firstPicker).toContainText('Second selection')
      }
      release()
      await (await delayedReply).finished()
      await page.unrouteAll({ behavior: 'wait' })
      await nextFrames(page)
      const expected = choice === 'other side' ? [id, second] : choice === 'same side' ? [second, null] : [null, null]
      const selected = () => {
        const state = simulatorState(page)
        return state?.sides.map((side) => side?.roster?.id ?? null)
      }
      await expect.poll(selected).toEqual(expected)
      if (choice === 'other side') await expect(firstPicker).toContainText('First selection')
      await page.screenshot({ path: test.info().outputPath(`roster-${choice.replace(' ', '-')}.png`), fullPage: true })
      await page.reload()
      await expect.poll(selected).toEqual(expected)
      if (choice === 'other side') await expect(secondPicker).toContainText('Second selection')
      if (choice === 'same side') await expect(firstPicker).toContainText('Second selection')
      if (choice === 'example') await expect(page.getByRole('region', { name: 'Attacker', exact: true })).toContainText('Intercessor Squad')
    } finally {
      release()
      await page.unrouteAll({ behavior: 'wait' })
    }
  })
