import { randomUUID } from 'node:crypto'
import { expect, test } from './test'
import {
  attachRoster,
  createBattle,
  createRoster,
  expectNoPageOverflow,
  playTurn,
  PHONE,
  retryUntilVisible,
  scoreboard,
  signUp,
  startBattle,
  takeTheTurn,
  uniqueName,
} from './account'
import { lastPathSegment, productOperator, userIdNamed } from './storage'

const GUEST = 'Alex the Guest'

test('New battle seats only accounts and practice opponents', async ({ page }) => {
  await signUp(page, uniqueName('Account host'))
  for (const viewport of [{ width: 1440, height: 900 }, PHONE]) {
    await page.setViewportSize(viewport)
    await createBattle(page, {
      practice: true,
      beforeCreate: async (dialog) => {
        await expect(dialog).toContainText('Everyone at the table needs an account')
        await page.getByRole('combobox', { name: 'Opponent' }).click()
        await expect(page.getByRole('option', { name: 'Guest', exact: true })).toHaveCount(0)
        await page.screenshot({ path: test.info().outputPath(`new-battle-${viewport.width}.png`) })
        await page.keyboard.press('Escape')
      },
    })
  }
})

test('a battle that seated a guest before every seat needed an account still opens and plays', async ({ page, browser }) => {
  test.setTimeout(300_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  const host = uniqueName('Guest host')
  await signUp(page, host)
  const roster = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Host army' })
  // Configured as New battle configures any guided duel, then seated with a guest the way earlier releases stored one.
  const operator = await productOperator()
  const template = (await operator.battleByToken(lastPathSegment(await createBattle(page, { practice: true }))))!
  const token = randomUUID()
  await operator.createBattle({
    id: randomUUID(),
    token,
    userId: await userIdNamed(host),
    guestNames: [GUEST],
    initialCommands: [template.log[0].command],
    now: Date.now(),
  })

  await page.goto(`/battles/${token}`)
  await expect(page.locator('[data-players="1"]').first()).toContainText(`${GUEST}Guest`)
  await expect(page.locator('[data-players="1"] a[href^="/users/"]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Invite/ })).toHaveCount(0)
  await attachRoster(page, roster)
  await attachRoster(page, roster, { forPlayer: GUEST })
  await startBattle(page)
  await playTurn(page)
  // The host deals the guest's hand, because nobody else can.
  await expect(page.getByRole('dialog', { name: `${GUEST}’s secondary missions` })).toBeVisible()
  await takeTheTurn(page)
  await expect(scoreboard(page).getByText(`${GUEST}’s turn`, { exact: true })).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('guest-battle-desktop.png') })
  await page.setViewportSize(PHONE)
  await expectNoPageOverflow(page)
  await page.screenshot({ path: test.info().outputPath('guest-battle-phone.png'), fullPage: true })
  await page.setViewportSize({ width: 1440, height: 900 })

  const concede = page.getByRole('menuitem', { name: `Concede for ${GUEST}`, exact: true })
  await retryUntilVisible(concede, () => page.getByRole('button', { name: 'Battle options' }).click())
  await concede.click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: `Concede for ${GUEST}`, exact: true })
    .click()
  await expect(scoreboard(page).getByRole('heading')).toContainText('wins by concession')

  const visitor = await (await browser.newContext()).newPage()
  await visitor.goto(`/battles/${token}`)
  await expect(scoreboard(visitor).getByRole('heading')).toContainText('wins by concession')
  await expect(visitor.locator('main')).toContainText(GUEST)
  await visitor.context().close()
})
