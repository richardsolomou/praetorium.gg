import { expect, type Page, test } from './test'
import { createRoster, desktopContext, retryUntilVisible, signUp, waitForRosterSave, makeWarlord } from './account'
import { add, attach, shot } from './builder.harness'

const phone = { viewport: { width: 390, height: 844 } }

async function exportedText(page: Page) {
  await page.getByRole('button', { name: 'Roster actions' }).click()
  await page.getByRole('menuitem', { name: 'Export text' }).click()
  const dialog = page.getByRole('dialog', { name: 'Export roster' })
  const text = await dialog.locator('pre').innerText()
  await dialog.getByRole('button', { name: 'Close' }).click()
  return text
}

async function openImport(page: Page) {
  await page.goto('/rosters')
  const dialog = page.getByRole('dialog', { name: 'Import roster', exact: true })
  await retryUntilVisible(dialog.getByLabel('Roster text'), () => page.getByRole('button', { name: 'Import roster', exact: true }).click())
  return dialog
}

/** A code in the shipped format, for payloads the app itself would never encode. */
async function handMadeCode(payload: unknown, version = 1) {
  const stream = new Blob([JSON.stringify(payload)]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return `PR${version}.${Buffer.from(await new Response(stream).arrayBuffer()).toString('base64url')}`
}

test('an exchange code carries a roster to another account and to a visitor', async ({ browser }) => {
  const sender = await (await browser.newContext({ ...desktopContext, permissions: ['clipboard-read', 'clipboard-write'] })).newPage()
  await signUp(sender, 'Exchange sender')
  const name = await createRoster(sender, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Exchange army' })
  await add(sender, 'Immortals')
  await add(sender, 'Overlord')
  await attach(sender, 'Overlord', 'Immortals')
  await sender.locator('[data-unit="Overlord"]').getByRole('button', { name: 'Overlord', exact: true }).click()
  await makeWarlord(sender, 'Overlord')
  await sender
    .locator('[data-unit="Immortals"]')
    .getByRole('button', { name: /^Immortals/ })
    .click()
  for (let models = 6; models <= 10; models++) {
    await sender.getByRole('button', { name: 'More models in Immortals' }).click()
    await expect(sender.getByLabel('Immortals models')).toHaveText(String(models))
  }
  await waitForRosterSave(sender, () =>
    sender.locator('aside[aria-label="Loadout"]').getByRole('button', { name: 'Select Tesla carbine' }).click(),
  )
  await sender.reload()
  const sent = await exportedText(sender)

  await sender.getByRole('button', { name: 'Roster actions' }).click()
  await sender.getByRole('menuitem', { name: 'Exchange code' }).click()
  const exchange = sender.getByRole('dialog', { name: 'Exchange code' })
  await expect(exchange.getByRole('img', { name: `Exchange QR code for ${name}` })).toBeVisible()
  await exchange.getByRole('button', { name: 'Copy code' }).click()
  await expect(exchange.getByRole('button', { name: 'Copied' })).toBeVisible()
  const code = await sender.evaluate(() => navigator.clipboard.readText())
  expect(code).toBe(await exchange.getByLabel('Exchange code').innerText())
  await shot(exchange, 'test-results/roster-exchange-code-desktop.png')
  await sender.setViewportSize(phone.viewport)
  await expect(exchange.getByRole('button', { name: 'Copied' })).toBeInViewport()
  await shot(exchange, 'test-results/roster-exchange-code-phone.png')

  // Another account scans the QR code on a phone: the link opens the import review.
  const recipient = await (await browser.newContext(phone)).newPage()
  await signUp(recipient, 'Exchange recipient')
  await recipient.goto(`/rosters#code=${code}`)
  const review = recipient.getByRole('dialog', { name: 'Import roster', exact: true })
  await expect(review).toContainText('2 of 2 matched entries')
  await expect(review).toContainText('preparation and reminders are not included')
  await expect(review.getByRole('alert')).toHaveCount(0)
  expect(new URL(recipient.url()).hash).toBe('')
  await shot(review, 'test-results/roster-exchange-review-phone.png')
  await review.getByRole('button', { name: 'Import roster', exact: true }).click()
  await recipient.waitForURL(/\/rosters\/[^/]+$/)
  await recipient.reload()
  const received = await exportedText(recipient)
  expect(received.replace(/^.*Exported with.*$/m, '')).toBe(sent.replace(/^.*Exported with.*$/m, ''))

  // Importing the same code again makes a second, separate copy.
  await recipient.setViewportSize(desktopContext.viewport)
  const again = await openImport(recipient)
  await again.getByLabel('Roster text').fill(code)
  await again.getByRole('button', { name: 'Import pasted roster', exact: true }).click()
  await expect(again).toContainText('2 of 2 matched entries')
  await shot(again, 'test-results/roster-exchange-review-desktop.png')
  await again.getByRole('button', { name: 'Import roster', exact: true }).click()
  await recipient.waitForURL(/\/rosters\/[^/]+$/)
  await recipient.goto('/rosters')
  await expect(recipient.locator(`[data-roster="${name}"]`)).toHaveCount(2)

  // The sender's library still holds exactly the one list it exported, and offers the same code.
  await sender.setViewportSize(desktopContext.viewport)
  await sender.goto('/rosters')
  await expect(sender.locator('[data-roster]')).toHaveCount(1)
  await sender
    .locator(`[data-roster="${name}"]`)
    .getByRole('button', { name: `Actions for ${name}` })
    .click()
  await sender.getByRole('menuitem', { name: 'Exchange code' }).click()
  await expect(sender.getByRole('dialog', { name: 'Exchange code' }).getByLabel('Exchange code')).toHaveText(code)

  // A visitor opens the same link and gets a local draft, no account involved.
  const visitor = await (await browser.newContext(phone)).newPage()
  await visitor.goto(`/rosters#code=${code}`)
  const draft = visitor.getByRole('dialog', { name: 'Import roster', exact: true })
  await expect(draft).toContainText('2 of 2 matched entries')
  await draft.getByRole('button', { name: 'Open imported draft', exact: true }).click()
  await expect(visitor.locator('[data-unit="Immortals"]')).toHaveCount(1)
  await expect(visitor.locator('[data-unit="Overlord"]')).toContainText('Immortals')
  await visitor.reload()
  expect((await exportedText(visitor)).replace(/^.*Exported with.*$/m, '')).toBe(sent.replace(/^.*Exported with.*$/m, ''))

  // Opening a link again never replaces the one draft a visitor keeps without asking.
  await visitor.goto('/')
  await visitor.goto(`/rosters#code=${code}`)
  const notice = visitor.getByRole('alert').filter({ hasText: 'Your link carries another roster' })
  await expect(notice).toBeVisible()
  await expect(visitor.getByRole('dialog', { name: 'Import roster', exact: true })).toHaveCount(0)
  await shot(notice, 'test-results/roster-exchange-guest-draft-notice-phone.png')
  await notice.getByRole('button', { name: 'Discard draft and import' }).click()
  await expect(draft).toContainText('2 of 2 matched entries')
})

test('damaged, unsupported and unavailable exchange codes explain why they cannot import', async ({ browser }) => {
  const valid = await handMadeCode({
    name: 'Valid army',
    catalogueId: 'missing-edition~necrons',
    detachmentIds: [],
    disposition: null,
    borrowedDetachmentId: null,
    limit: 2000,
    points: null,
    waivedRules: [],
    optionalRules: [],
    picks: [],
  })
  const cases = [
    { code: valid.slice(0, -6), reason: 'incomplete or damaged' },
    { code: valid.replace(/^PR1\./, 'PR9.'), reason: 'uses format 9, which this version of Praetorium cannot read' },
    { code: `PR1.${'A'.repeat(12_001)}`, reason: 'longer than 12,000 characters' },
    { code: valid, reason: 'uses a rules version that is not available here' },
  ]
  for (const [context, width] of [
    [desktopContext, 'desktop'],
    [phone, 'phone'],
  ] as const) {
    const page = await (await browser.newContext(context)).newPage()
    if (width === 'desktop') await signUp(page, 'Exchange damaged')
    const dialog = await openImport(page)
    for (const { code, reason } of cases) {
      await dialog.getByLabel('Roster text').fill(code)
      await dialog.getByRole('button', { name: 'Import pasted roster', exact: true }).click()
      await expect(dialog.getByRole('alert')).toContainText(reason)
    }
    await shot(dialog, `test-results/roster-exchange-unavailable-${width}.png`)
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.locator('[data-roster], [data-roster-builder]')).toHaveCount(0)
  }
})

test('a roster too long for a QR code still offers its exchange code', async ({ browser }) => {
  const page = await (await browser.newContext(phone)).newPage()
  await signUp(page, 'Exchange long')
  // Forty distinct datasheets with explicit choices make a code longer than one QR code holds.
  const units = (
    'Imotekh the Stormlord|Orikan the Diviner|Illuminor Szeras|Trazyn the Infinite|Royal Warden|Skorpekh Lord|Lokhust Lord|' +
    'Catacomb Command Barge|Overlord|Technomancer|Psychomancer|Chronomancer|Plasmancer|Necron Warriors|Immortals|' +
    'Canoptek Reanimator|Hexmark Destroyer|Lychguard|Deathmarks|Flayed Ones|Cryptothralls|Skorpekh Destroyers|Triarch Stalker|' +
    'Canoptek Spyders|Canoptek Scarab Swarms|Ophydian Destroyers|Tomb Blades|Triarch Praetorians|Canoptek Wraiths|' +
    'Annihilation Barge|Doomsday Ark|Lokhust Destroyers|Lokhust Heavy Destroyers|Canoptek Doomstalker|Ghost Ark|Night Scythe|' +
    'Doom Scythe|Obelisk|Tesseract Vault|Monolith'
  ).split('|')
  const text = `Long army (999 Points)\n\nNecrons\nAwakened Dynasty\nForce Disposition: Take and Hold\nStrike Force (2,000 Points)\n\nOTHER DATASHEETS\n\n${units.map((unit) => `${unit} (10 Points)\n\n`).join('')}Exported with Praetorium.gg vtest\n`
  const dialog = await openImport(page)
  await dialog.getByLabel('Roster text').fill(text)
  await dialog.getByRole('button', { name: 'Import pasted roster', exact: true }).click()
  await expect(dialog).toContainText(`${units.length} of ${units.length} matched entries`)
  await dialog.getByRole('button', { name: /^Import (roster|anyway)$/ }).click()
  await page.waitForURL(/\/rosters\/[^/]+$/)

  await page.goto('/rosters')
  await page.locator('[data-roster="Long army"]').getByRole('button', { name: 'Actions for Long army' }).click()
  await page.getByRole('menuitem', { name: 'Exchange code' }).click()
  const exchange = page.getByRole('dialog', { name: 'Exchange code' })
  await expect(exchange).toContainText('too long for a reliable QR code')
  await expect(exchange.getByRole('img')).toHaveCount(0)
  await shot(exchange, 'test-results/roster-exchange-too-long-phone.png')
  const code = await exchange.getByLabel('Exchange code').innerText()
  await exchange.getByRole('button', { name: 'Close' }).click()

  const again = await openImport(page)
  await again.getByLabel('Roster text').fill(code)
  await again.getByRole('button', { name: 'Import pasted roster', exact: true }).click()
  await expect(again).toContainText(`${units.length} of ${units.length} matched entries`)
})
