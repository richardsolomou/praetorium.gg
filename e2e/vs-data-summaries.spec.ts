import { downloadOfflineAppAtOnce, waitForOfflineApp } from './offline'
import { expect, test } from './test'

test.use({ rulesText: false })

test('stratagems show VS Data summaries online and offline without rules text', { tag: '@catalogue' }, async ({ page, context }) => {
  test.setTimeout(240_000)
  const url = '/factions/necrons/rules/mfm-1-6/detachments/pantheon-of-woe'
  const shown = async (reader: typeof page) => {
    const stratagems = reader.getByRole('region', { name: 'Stratagems' }).getByRole('article')
    await expect(stratagems.getByText('VS Data summary', { exact: true })).toHaveCount(6)
    await expect(stratagems.getByText('Rules text', { exact: true })).toHaveCount(0)
    return stratagems.allInnerTexts()
  }
  await downloadOfflineAppAtOnce(page)
  await page.goto(url)
  const online = await shown(page)
  await waitForOfflineApp(page)

  await context.setOffline(true)
  await page.close()
  const offline = await context.newPage()
  await offline.goto(url)
  expect(await shown(offline)).toEqual(online)
})
