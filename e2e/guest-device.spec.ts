import { expect, test, type Page } from './test'
import { advance, attachRoster, createBattle, createRoster, desktopContext, signUp, startBattle, takeTheTurn, uniqueName } from './account'
import { add } from './builder.harness'
import { productSql, withAuthSql } from './storage'

const GUEST = 'Sam the Guest'
const PHONE = { width: 390, height: 844 }
const scoreboard = (page: Page) => page.getByRole('region', { name: 'Battle scoreboard' })
const phase = (page: Page) => page.locator('[data-scoreboard] h1')
/** Below the five seconds a page without a live subscription waits between polls. */
const LIVE_MS = 3_000

async function battleId(url: string) {
  const [battle] = await productSql<{ id: string }>`SELECT id FROM battles WHERE token = ${new URL(url).pathname.split('/').at(-1)!}`
  if (!battle) throw new Error('Battle not found')
  return battle.id
}

/** The sessions subscribed to the battle's live signal, which a page records once its subscription applies. */
async function watchers(id: string) {
  return (await productSql<{ subject: string }>`SELECT subject FROM watched_battles WHERE battle_id = ${id}`).map((row) => row.subject)
}

async function loggedCommands(id: string) {
  return productSql`SELECT seq, user_id, body FROM commands WHERE battle_id = ${id}`
}

async function playerId(name: string) {
  const row = await withAuthSql(
    (database) => database.prepare('SELECT id FROM user WHERE name = ?').get(name) as { id: string } | undefined,
  )
  if (!row) throw new Error(`Missing test player ${name}`)
  return row.id
}

async function playTurn(page: Page) {
  for (let step = 0; step < 6; step += 1) await advance(page)
}

async function shot(page: Page, name: string) {
  const before = page.viewportSize()!
  for (const [label, size] of [
    ['desktop', { width: 1280, height: 900 }],
    ['phone', PHONE],
  ] as const) {
    await page.setViewportSize(size)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(size.width)
    await page.screenshot({ path: test.info().outputPath(`${name}-${label}.png`), fullPage: true })
  }
  await page.setViewportSize(before)
}

/** The guest's own builder, which is the visitor's: one list kept on this device. */
async function buildGuestRoster(page: Page) {
  const setup = page.getByRole('region', { name: 'Create roster' })
  await page.waitForLoadState('networkidle')
  await setup.getByRole('combobox', { name: 'Faction' }).click()
  await page.getByPlaceholder('Search factions…').fill('Necrons')
  await page.getByRole('option', { name: 'Necrons', exact: true }).click()
  await setup.getByRole('button', { name: /^Select (?:Awakened Dynasty)$/ }).click()
  await setup.getByRole('group', { name: 'Force disposition' }).getByRole('button', { name: 'Take and Hold' }).click()
  await setup.getByRole('button', { name: 'Start building' }).click()
  await add(page, 'Necron Warriors')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('praetorium.guest-draft') ?? '')).toContain('"picks":[{')
}

test('a guest joins from their own device, plays their side and keeps the game by signing up', async ({ page: host, browser }) => {
  test.setTimeout(420_000)
  await host.setViewportSize(desktopContext.viewport)
  const guest = await (await browser.newContext(desktopContext)).newPage()
  const hostName = uniqueName('Guest host')
  await signUp(host, hostName)
  const roster = await createRoster(host, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Host army' })
  await createBattle(host, { guest: GUEST })
  await attachRoster(host, roster)

  // The host shares the seat; the guest opens it on another device, without an account.
  await host.getByRole('button', { name: `Invite ${GUEST} to play on their device` }).click()
  const invite = host.getByRole('dialog', { name: `Invite ${GUEST} to play` })
  await expect(invite.getByRole('img', { name: `QR code for ${GUEST}’s seat` })).toBeVisible()
  await shot(host, 'invite')
  const link = (await invite.locator('p.break-all').textContent())!
  await guest.goto(link)
  await expect(guest.getByRole('heading', { name: `Play as ${GUEST}` })).toBeVisible()
  await shot(guest, 'join')
  await guest.getByRole('button', { name: 'Join on this device' }).click()
  await guest.waitForURL(/\/battles\/[^/]+$/)
  const battleUrl = guest.url()
  const id = await battleId(battleUrl)
  // The guest's device subscribes to the battle's live signal as its seat, as a signed-in player's does.
  await expect.poll(async () => (await watchers(id)).some((subject) => subject.startsWith('guest-device:'))).toBe(true)
  await expect(host.getByRole('dialog', { name: `${GUEST} is playing on their device` })).toBeVisible()
  await host.keyboard.press('Escape')

  // A second device is refused the seat the first one took.
  const stranger = await (await browser.newContext()).newPage()
  await stranger.goto(link)
  await expect(stranger.getByRole('heading', { name: `${GUEST} already joined` })).toBeVisible()

  // The guest builds their own list with the normal builder and brings it.
  await guest.getByRole('button', { name: `Choose roster for ${GUEST}` }).click()
  await guest.getByRole('dialog', { name: 'Choose your roster' }).getByRole('link', { name: 'Build or import a roster' }).click()
  await buildGuestRoster(guest)
  await guest.getByRole('link', { name: 'Back to your battle' }).click()
  await guest.getByRole('button', { name: `Choose roster for ${GUEST}` }).click()
  const chooser = guest.getByRole('dialog', { name: 'Choose your roster' })
  await shot(guest, 'guest-chooser')
  await chooser.getByRole('button', { name: 'Bring this roster' }).click()
  await expect(chooser).toBeHidden()
  await expect(host.locator('[data-players="1"]').first()).toBeVisible()
  await expect(host.getByRole('region', { name: 'Armies' })).toContainText('Ready')
  // The host no longer chooses for a guest who plays their own seat.
  await expect(host.getByRole('button', { name: `Choose roster for ${GUEST}` })).toHaveCount(0)
  await shot(guest, 'guest-setup')

  await startBattle(host)
  // The host keeps the seat's controls during play, to take it back if the guest's device is lost.
  await host.getByRole('button', { name: `Invite ${GUEST} to play on their device` }).click()
  await expect(host.getByRole('dialog', { name: `${GUEST} is playing on their device` })).toBeVisible()
  await host.keyboard.press('Escape')
  // The host's move reaches the guest's device through the live signal, sooner than a poll could.
  await advance(host)
  await expect(phase(guest)).toHaveText((await phase(host).textContent())!, { timeout: LIVE_MS })
  // The guest's hand is theirs now, dealt on their device rather than the host's.
  for (let step = 1; step < 6; step += 1) await advance(host)
  await takeTheTurn(guest)
  await expect(scoreboard(guest).getByText(`${GUEST}’s turn`, { exact: true })).toBeVisible()
  await shot(guest, 'guest-battle')
  await playTurn(guest)
  await takeTheTurn(host)
  await expect(host.locator('[data-stat="round"]')).toHaveText('2')

  const concede = guest.getByRole('menuitem', { name: 'Concede battle', exact: true })
  await expect(async () => {
    if (await concede.isVisible()) return
    await guest.getByRole('button', { name: 'Battle options' }).click({ timeout: 2_000 })
    await expect(concede).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 20_000 })
  await concede.click()
  await guest.getByRole('alertdialog').getByRole('button', { name: 'Concede battle', exact: true }).click()
  await expect(scoreboard(guest).getByRole('heading')).toContainText('wins by concession')

  // The finished game is when signing up is offered, with what it brings.
  const keep = guest.getByRole('region', { name: 'Keep this battle' })
  await expect(keep).toContainText(`${hostName} as a friend`)
  await shot(guest, 'keep')
  await keep.getByRole('link', { name: 'Create an account' }).click()
  const guestName = uniqueName('Former guest')
  await guest.waitForLoadState('networkidle')
  await guest.getByLabel('Your name').fill(guestName)
  await guest.getByLabel('Email').fill(`${guestName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}@example.test`)
  await guest.getByLabel('Password').fill('a-long-enough-password')
  await guest.getByRole('button', { name: 'Create account', exact: true }).click()
  await guest.waitForURL(battleUrl)

  const claim = guest.getByRole('region', { name: 'Add this battle to your record' })
  await shot(guest, 'claim')
  const written = await loggedCommands(id)
  await claim.getByRole('button', { name: 'Add to my record' }).click()
  const claimed = guest.getByRole('region', { name: 'This battle is in your record' })
  await expect(claimed).toBeVisible()
  // Claiming records who the seat was; the log stays exactly as it was played.
  expect(await loggedCommands(id)).toEqual(written)
  await expect(guest.getByText(`${GUEST} concedes`)).toHaveCount(0)
  await shot(guest, 'claimed')
  await claimed.getByRole('button', { name: `Add ${hostName} as a friend` }).click()
  await expect(claimed.getByRole('button', { name: 'Friend request sent' })).toBeVisible()

  // The battle is now one between two accounts: both records hold it, and the guest name is gone.
  await guest.goto(`/users/${await playerId(guestName)}`)
  await expect(guest.locator('[data-service-record] [data-record-battles]')).toHaveAttribute('data-record-battles', '1')
  await host.goto(battleUrl)
  await expect(scoreboard(host)).toContainText(guestName)
  await expect(scoreboard(host)).not.toContainText(GUEST)
  await host.goto('/friends')
  await expect(host.getByText(guestName).first()).toBeVisible()
})
