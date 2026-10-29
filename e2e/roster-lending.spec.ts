import { expect, test } from './test'
import {
  attachRoster,
  befriend,
  chooseRosterAction,
  chooseRosterDefault,
  createBattle,
  createRoster,
  followLink,
  retryUntilVisible,
  signUp,
  uniqueName,
  expectNoPageOverflow,
  PHONE,
  setupStep,
} from './account'
import type { Page } from '@playwright/test'

async function setLoan(owner: Page, rosterUrl: string, borrowerName: string, lent: boolean) {
  await owner.goto(rosterUrl)
  await chooseRosterAction(owner, 'Lend to a friend')
  const dialog = owner.getByRole('dialog', { name: 'Lend to a friend' })
  const loan = dialog.getByRole('switch', { name: `Lend to ${borrowerName}` })
  await loan.click()
  await expect(loan).toBeChecked({ checked: lent })
  if (lent) await dialog.screenshot({ path: test.info().outputPath('roster-lending-dialog.png') })
  await owner.keyboard.press('Escape')
}

test('a friend fields a lent roster, and the battle keeps it after the loan ends', async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage()
  const borrower = await (await browser.newContext()).newPage()
  const ownerName = uniqueName('Lender')
  const borrowerName = uniqueName('Borrower')

  await signUp(owner, ownerName)
  await chooseRosterDefault(owner, 'Private')
  const rosterName = await createRoster(owner, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Lent army' })
  const rosterUrl = owner.url()
  await signUp(borrower, borrowerName)
  await befriend(owner, borrower)

  await borrower.goto(rosterUrl)
  await expect(borrower.getByRole('heading', { name: 'Nothing here' })).toBeVisible()

  await setLoan(owner, rosterUrl, borrowerName, true)
  await borrower.goto('/rosters')
  await expect(borrower.locator('[data-lent-rosters]').getByText(`Lent by ${ownerName}`)).toBeVisible()
  await borrower.locator('[data-lent-rosters]').getByRole('link').first().click()
  await expect(borrower.locator('[data-roster-lent-by]')).toContainText(`Lent to you by ${ownerName}`)
  await expect(borrower.getByLabel('Add a unit')).toHaveCount(0)
  await borrower.setViewportSize(PHONE)
  await expectNoPageOverflow(borrower)
  await borrower.screenshot({ path: test.info().outputPath('roster-lending-borrower-phone.png') })
  await borrower.setViewportSize({ width: 1440, height: 900 })

  const battle = await createBattle(borrower, { practice: true })
  await borrower
    .getByRole('button', { name: /^Choose roster/ })
    .first()
    .click()
  await borrower.getByRole('dialog', { name: /roster$/ }).screenshot({ path: test.info().outputPath('roster-lending-chooser.png') })
  await borrower.keyboard.press('Escape')
  await attachRoster(borrower, rosterName)
  await setupStep(borrower, 'Armies')
  const armies = borrower.getByRole('region', { name: 'Armies' })
  await expect(armies.getByText(`Lent by ${ownerName}`)).toBeVisible()

  await setLoan(owner, rosterUrl, borrowerName, false)
  await borrower.goto('/rosters')
  await expect(borrower.getByLabel('Loading roster count')).toHaveCount(0)
  await expect(borrower.locator('[data-lent-rosters]')).toHaveCount(0)
  await borrower.goto(battle)
  await setupStep(borrower, 'Armies')
  await expect(borrower.getByRole('region', { name: 'Armies' }).getByText(`Lent by ${ownerName}`)).toBeVisible()
})

test('a borrower hands a lent roster back', async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage()
  const borrower = await (await browser.newContext()).newPage()
  const ownerName = uniqueName('Lender')
  const borrowerName = uniqueName('Borrower')

  await signUp(owner, ownerName)
  await chooseRosterDefault(owner, 'Private')
  await createRoster(owner, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Returned army' })
  const rosterUrl = owner.url()
  await signUp(borrower, borrowerName)
  await befriend(owner, borrower)
  await setLoan(owner, rosterUrl, borrowerName, true)

  await borrower.goto(rosterUrl)
  const confirmReturn = borrower.getByRole('alertdialog', { name: /^Return / })
  await retryUntilVisible(confirmReturn, () =>
    borrower.locator('[data-roster-lent-by]').getByRole('button', { name: 'Return it' }).click({ timeout: 1_000 }),
  )
  // The confirmation stays disabled until its navigation finishes, so a repeated press cannot return the roster twice.
  await followLink(confirmReturn.getByRole('button', { name: 'Return it' }), /\/rosters$/)
  await expect(borrower.getByLabel('Loading roster count')).toHaveCount(0)
  await expect(borrower.locator('[data-lent-rosters]')).toHaveCount(0)
  await owner.goto(rosterUrl)
  await chooseRosterAction(owner, 'Lend to a friend')
  await expect(owner.getByRole('switch', { name: `Lend to ${borrowerName}` })).not.toBeChecked()
})
