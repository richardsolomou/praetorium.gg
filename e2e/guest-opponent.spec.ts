import { expect, test } from './test'
import {
  attachRoster,
  chooseOption,
  createBattle,
  createRoster,
  recordFirstTurn,
  retryUntilVisible,
  setupStep,
  signUp,
  startBattle,
  takeTheTurn,
  uniqueName,
  playTurn,
  expectNoPageOverflow,
  PHONE,
  scoreboard,
} from './account'
import { userIdNamed } from './storage'

const GUEST = 'Alex the Guest'
test('a host records a real game against a guest without an account', async ({ page }) => {
  test.setTimeout(300_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  const host = uniqueName('Guest host')
  await signUp(page, host)
  const roster = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Host army' })

  await createBattle(page, {
    guest: GUEST,
    beforeCreate: async (dialog) => {
      await expect(dialog.getByText(/You play their side, or share a link so they play it on their own device\./)).toBeVisible()
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
  await page.setViewportSize(PHONE)
  await expectNoPageOverflow(page)
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

  await page.goto(`/users/${await userIdNamed(host)}`)
  await expect(page.locator('[data-service-record] [data-record-battles]')).toHaveAttribute('data-record-battles', '1')
  await page.screenshot({ path: test.info().outputPath('record-desktop.png'), fullPage: true })
  await page.setViewportSize(PHONE)
  await page.screenshot({ path: test.info().outputPath('record-phone.png'), fullPage: true })

  await page.goto('/leaderboard')
  await expect(page.locator('main')).toContainText('Practice, guest, private and manually tracked battles do not count.')
  await expect(page.locator('[data-standing]').filter({ hasText: host })).toHaveCount(0)
})

const pastedList = `Opponent list (120 Points)

Necrons
Awakened Dynasty (1 Detachment Points)
Take and Hold
Strike Force (2,000 Points)

BATTLELINE

Necron Warriors (90 Points)
  • 10x Necron Warrior
     ◦ 10x Gauss flayer
     ◦ 10x Close combat weapon

Exported with App Version: v2.8.1 (1), Data Version: v995`

test('a guest with no list on the app can have one pasted in, or skip it in a manual game', async ({ page }) => {
  await signUp(page, uniqueName('Table host'))
  const roster = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/ })
  await createBattle(page, { guest: 'Sam' })
  await attachRoster(page, roster)
  await page.getByRole('button', { name: 'Choose roster for Sam' }).click()
  const paste = page.locator('[data-paste-opponent]')
  await paste.getByRole('textbox').fill(pastedList)
  await paste.getByRole('button', { name: 'Read list' }).click()
  await expect(paste).toContainText('Opponent list')
  await page.screenshot({ path: test.info().outputPath('guest-paste.png') })
  await paste.getByRole('button', { name: 'Use this list' }).click()
  await setupStep(page, 'Armies')
  await expect(page.getByRole('button', { name: 'Change roster for Sam' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Armies', exact: true })).toContainText('Opponent list')

  await createBattle(page, {
    guest: 'Alex',
    beforeCreate: async (dialog) => dialog.getByRole('button', { name: /^Manual/ }).click(),
  })
  await attachRoster(page, roster)
  await page.getByRole('button', { name: 'Keep score only' }).click()
  await expect(page.getByRole('button', { name: 'Keep score only' })).toHaveCount(0)
  await setupStep(page, 'Format')
  await chooseOption(page, 'Battle size', /Strike Force/)
  await recordFirstTurn(page)
  await page.getByRole('button', { name: 'Start battle' }).click()
  await expect(page.getByRole('heading', { name: 'command phase' })).toBeVisible()
})
