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
  sealableRoster,
} from './account'
import type { Locator, Page } from '@playwright/test'
import { screenshot } from './screenshots'

/** A lent roster's line naming its owner, whose name is a link behind their avatar. */
const lentBy = (rosters: Locator, owner: string) =>
  rosters.locator('p', { hasText: 'Lent by' }).getByRole('link', { name: owner, exact: true })

async function setLoan(owner: Page, rosterUrl: string, borrowerName: string, lent: boolean) {
  await owner.goto(rosterUrl)
  await chooseRosterAction(owner, 'Lend to a friend')
  const dialog = owner.getByRole('dialog', { name: 'Lend to a friend' })
  const loan = dialog.getByRole('switch', { name: `Lend to ${borrowerName}` })
  await loan.click()
  await expect(loan).toBeChecked({ checked: lent })
  if (lent) await screenshot(dialog, 'roster-lending-dialog.png')
  await owner.keyboard.press('Escape')
}

test('a friend fields a lent roster, the battle keeps it after the loan ends, and a borrower hands it back', async ({ browser }) => {
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
  await expect(borrower.getByRole('heading', { name: 'No such roster' })).toBeVisible()

  await setLoan(owner, rosterUrl, borrowerName, true)
  await borrower.goto('/rosters')
  await expect(lentBy(borrower.locator('[data-lent-rosters]'), ownerName)).toBeVisible()
  await borrower.locator('[data-lent-rosters]').getByRole('link').first().click()
  await expect(borrower.locator('[data-roster-lent-by]')).toContainText(`Lent to you by ${ownerName}`)
  await expect(borrower.getByLabel('Add a unit')).toHaveCount(0)
  await borrower.setViewportSize(PHONE)
  await expectNoPageOverflow(borrower)
  await screenshot(borrower, 'roster-lending-borrower-phone.png')
  await borrower.setViewportSize({ width: 1440, height: 900 })

  const battle = await createBattle(borrower, { practice: true })
  await borrower.locator('[data-face-off-side="0"]').getByRole('button', { name: 'Choose army', exact: true }).click()
  await screenshot(borrower.getByRole('dialog', { name: /roster$/ }), 'roster-lending-chooser.png')
  await borrower.keyboard.press('Escape')
  await attachRoster(borrower, rosterName)
  await expect(borrower.locator('[data-face-off-side="0"]').getByText(`Lent by ${ownerName}`)).toBeVisible()

  await setLoan(owner, rosterUrl, borrowerName, false)
  await borrower.goto('/rosters')
  await expect(borrower.getByLabel('Loading roster count')).toHaveCount(0)
  await expect(borrower.locator('[data-lent-rosters]')).toHaveCount(0)
  await borrower.goto(battle)
  await expect(borrower.locator('[data-face-off-side="0"]').getByText(`Lent by ${ownerName}`)).toBeVisible()

  // Lent again, the borrower hands it back.
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

test('a borrower seals and simulates a lent roster', async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage()
  const borrower = await (await browser.newContext()).newPage()
  const ownerName = uniqueName('Lender')
  const borrowerName = uniqueName('Borrower')

  await signUp(owner, ownerName)
  await chooseRosterDefault(owner, 'Private')
  await sealableRoster(owner, 'Sealed loan')
  const rosterUrl = owner.url()
  await signUp(borrower, borrowerName)
  await befriend(owner, borrower)
  await setLoan(owner, rosterUrl, borrowerName, true)

  await borrower.goto('/tournaments')
  const create = borrower.getByRole('dialog', { name: 'New tournament' })
  await retryUntilVisible(create, () => borrower.getByRole('button', { name: 'New tournament' }).click({ timeout: 1_000 }))
  const plays = create.getByRole('switch', { name: /I’m playing too/ })
  if (!(await plays.isChecked())) await plays.click()
  await create.getByLabel('Name').fill(uniqueName('Loan cup'))
  await create.getByRole('button', { name: 'Create tournament' }).click()
  await expect(borrower).toHaveURL(/\/tournaments\/[^/?]+/)

  const chooser = borrower.getByRole('dialog', { name: 'Seal a roster' })
  await retryUntilVisible(chooser, () => borrower.getByRole('button', { name: 'Choose a roster' }).click({ timeout: 1_000 }))
  const lent = chooser.locator('[data-lent-rosters]')
  await expect(lentBy(lent, ownerName)).toBeVisible()
  await lent.getByRole('button').first().click()
  await screenshot(chooser, 'roster-lending-seal-chooser.png')
  await chooser.getByRole('button', { name: 'Seal Sealed loan' }).click()
  await expect(chooser).toBeHidden()
  await expect(borrower.getByRole('button', { name: 'Swap roster' })).toBeVisible()

  await borrower.goto('/simulator')
  await borrower.waitForLoadState('networkidle')
  const lentChoice = borrower.getByRole('option', { name: new RegExp(`^Sealed loan · ${ownerName}$`) })
  await retryUntilVisible(lentChoice, () => borrower.getByRole('combobox', { name: 'Attacking with', exact: true }).click())
  await screenshot(borrower, 'roster-lending-simulator.png')
  await lentChoice.click()
  await borrower.getByRole('option', { name: 'The whole roster', exact: true }).click()
  await expect(
    borrower.getByRole('region', { name: 'Roster comparison' }).getByRole('group', { name: 'Attacking with', exact: true }),
  ).toContainText('Sealed loan')
})
