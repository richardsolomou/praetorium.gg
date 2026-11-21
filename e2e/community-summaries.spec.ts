import { downloadOfflineAppAtOnce, waitForOfflineApp } from './offline'
import { expect, test } from './test'

test.use({ rulesText: false })

test(
  'the four Pantheon of Woe community summaries appear online and offline without rules text',
  { tag: '@catalogue' },
  async ({ page, context }) => {
    test.setTimeout(240_000)
    const url = '/factions/necrons/rules/mfm-1-6/detachments/pantheon-of-woe'
    const names = ['Disharmonisation Cascade', 'Mass Transmogrification', 'Phase Melding', 'Reletavistic Tether']
    const shown = (reader: typeof page) =>
      Promise.all(
        names.map(async (name) => {
          const card = reader.getByRole('article').filter({ has: reader.getByRole('heading', { name, exact: true }) })
          await expect(card.getByText('Community summary', { exact: true })).toBeVisible()
          await expect(card.getByText('Rules text', { exact: true })).toHaveCount(0)
          return card.innerText()
        }),
      )
    await downloadOfflineAppAtOnce(page)
    await page.goto(url)
    const online = await shown(page)
    await expect(page.getByText('Community summary', { exact: true })).toHaveCount(4)
    await waitForOfflineApp(page)

    await context.setOffline(true)
    await page.close()
    const offline = await context.newPage()
    await offline.goto(url)
    expect(await shown(offline)).toEqual(online)
    await expect(offline.getByText('Community summary', { exact: true })).toHaveCount(4)
  },
)
