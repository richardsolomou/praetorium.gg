import { expect, test, type Page } from './test'
import {
  advance,
  attachRoster,
  createBattle,
  createRoster,
  retryUntilVisible,
  signUp,
  startBattle,
  takeTheTurn,
  uniqueName,
} from './account'
import { withAuthSql } from './storage'

const GUEST = 'Alex the Guest'
const scoreboard = (page: Page) => page.getByRole('region', { name: 'Battle scoreboard' })
const noOverflow = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width)

async function playerId(name: string) {
  const row = await withAuthSql(
    (database) => database.prepare('SELECT id FROM user WHERE name = ?').get(name) as { id: string } | undefined,
  )
  if (!row) throw new Error(`Missing test player ${name}`)
  return row.id
}

async function playTurn(page: Page) {
  for (let phase = 0; phase < 6; phase += 1) await advance(page)
}

test('a host records a real game against a guest without an account', async ({ page }) => {
  test.setTimeout(300_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  const host = uniqueName('Guest host')
  await signUp(page, host)
  const roster = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Host army' })

  await createBattle(page, {
    guest: GUEST,
    beforeCreate: async (dialog) => {
      await expect(dialog.getByText(/You play their side\. The game counts in your record but not on the leaderboard/)).toBeVisible()
      await page.screenshot({ path: test.info().outputPath('create-desktop.png') })
    },
  })
  await expect(page.locator('[data-players="1"]').first()).toContainText(`${GUEST}Guest`)
  await expect(page.locator('[data-players="1"] a[href^="/users/"]')).toHaveCount(0)

  await attachRoster(page, roster)
  await attachRoster(page, roster, { forPlayer: GUEST })
  await startBattle(page)
  await page.screenshot({ path: test.info().outputPath('battle-desktop.png') })

  await playTurn(page)
  // The host deals the guest's hand, because nobody else can.
  await expect(page.getByRole('dialog', { name: `${GUEST}’s secondary missions` })).toBeVisible()
  await takeTheTurn(page)
  await expect(scoreboard(page).getByText(`${GUEST}’s turn`, { exact: true })).toBeVisible()
  await playTurn(page)
  await expect(page.locator('[data-stat="round"]')).toHaveText('2')
  await takeTheTurn(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await noOverflow(page)
  await page.screenshot({ path: test.info().outputPath('battle-phone.png'), fullPage: true })
  await page.setViewportSize({ width: 1440, height: 900 })

  const concede = page.getByRole('menuitem', { name: `Concede for ${GUEST}`, exact: true })
  await retryUntilVisible(concede, () => page.getByRole('button', { name: 'Battle options' }).click())
  await concede.click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: `Concede for ${GUEST}`, exact: true })
    .click()
  await expect(scoreboard(page).getByRole('heading')).toContainText('wins by concession')

  await page.goto(`/users/${await playerId(host)}`)
  await expect(page.locator('[data-service-record] [data-record-battles]')).toHaveAttribute('data-record-battles', '1')
  await page.screenshot({ path: test.info().outputPath('record-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: test.info().outputPath('record-phone.png'), fullPage: true })

  await page.goto('/leaderboard')
  await expect(page.locator('main')).toContainText('Practice, guest, private and manually tracked battles do not count.')
  await expect(page.locator('[data-standing]').filter({ hasText: host })).toHaveCount(0)
})
