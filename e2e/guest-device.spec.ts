import { expect, test, type Page } from './test'
import {
  advance,
  attachRoster,
  createBattle,
  createRoster,
  desktopContext,
  retryUntilVisible,
  signUp,
  startBattle,
  takeTheTurn,
  uniqueName,
  playTurn,
  shotAtWidths,
  PHONE,
  chooseFaction,
  scoreboard,
  setupStep,
} from './account'
import { add } from './builder.harness'
import { productSql, userIdNamed, lastPathSegment, battleIdFor, guestDraft } from './storage'

const GUEST = uniqueName('Sam the Guest')
const phase = (page: Page) => page.locator('[data-scoreboard] h1')
/** Below the five seconds a page without a live subscription waits between polls. */
const LIVE_MS = 3_000

/** The sessions subscribed to the battle's live signal, which a page records once its subscription applies. */
async function watchers(id: string) {
  return (await productSql<{ subject: string }>`SELECT subject FROM watched_battles WHERE battle_id = ${id}`).map((row) => row.subject)
}

async function loggedCommands(id: string) {
  return productSql`SELECT seq, user_id, body FROM commands WHERE battle_id = ${id}`
}

/** A short panel on a phone sizes to what it holds rather than taking the whole screen. */
async function expectFitsOnPhone(page: Page, panel: ReturnType<Page['getByRole']>) {
  const before = page.viewportSize()!
  await page.setViewportSize(PHONE)
  expect((await panel.boundingBox())!.height).toBeLessThan(PHONE.height * 0.8)
  await page.setViewportSize(before)
}

/** The guest's own rosters page and builder, which are a visitor's: one list kept on this device. */
async function buildGuestRoster(page: Page) {
  const setup = page.getByRole('dialog', { name: 'Create roster' })
  await page.waitForLoadState('networkidle')
  await retryUntilVisible(setup, () => page.getByRole('button', { name: 'New roster', exact: true }).click())
  await chooseFaction(setup, 'Necrons')
  await setup.getByRole('button', { name: /^Select (?:Awakened Dynasty)$/ }).click()
  await setup.getByRole('group', { name: 'Force disposition' }).getByRole('button', { name: 'Take and Hold' }).click()
  await setup.getByRole('button', { name: 'Create roster' }).click()
  await add(page, 'Necron Warriors')
  await expect.poll(() => guestDraft(page)).toContain('"picks":[{')
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
  // A side still waiting for its army has no secondaries to set up yet, which is not missing data.
  await setupStep(host, 'Secondaries')
  await expect(host.getByText('Secondaries open once this side’s army is chosen.')).toBeVisible()
  await expect(host.getByText('Mission and stratagem data is unavailable')).toHaveCount(0)

  // The host shares the seat; the guest opens it on another device, without an account.
  await host.getByRole('button', { name: `Invite ${GUEST} to play on their device` }).click()
  const invite = host.getByRole('dialog', { name: `Invite ${GUEST} to play` })
  await expect(invite.getByRole('img', { name: `QR code for ${GUEST}’s seat` })).toBeVisible()
  await expectFitsOnPhone(host, invite)
  await shotAtWidths(host, 'invite', { fullPage: true })
  const link = (await invite.locator('p.break-all').textContent())!
  await guest.goto(link)
  await expect(guest.getByRole('heading', { name: `Play as ${GUEST}` })).toBeVisible()
  await shotAtWidths(guest, 'join', { fullPage: true })
  await guest.getByRole('button', { name: 'Join on this device' }).click()
  await guest.waitForURL(/\/battles\/[^/]+$/)
  const battleUrl = guest.url()
  const id = await battleIdFor(lastPathSegment(battleUrl))
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
  await expectFitsOnPhone(guest, chooser)
  await shotAtWidths(guest, 'guest-chooser', { fullPage: true })
  await chooser.getByRole('button', { name: 'Bring this roster' }).click()
  await expect(chooser).toBeHidden()
  await expect(host.locator('[data-players="1"]').first()).toBeVisible()
  // Every army in folds the step to its answer, so open it once it has.
  await expect(host.locator('#setup-armies')).toHaveAttribute('data-complete', 'true')
  await setupStep(host, 'Armies')
  await expect(host.getByRole('region', { name: 'Armies' })).toContainText('Ready')
  // The host no longer chooses for a guest who plays their own seat.
  await expect(host.getByRole('button', { name: `Choose roster for ${GUEST}` })).toHaveCount(0)
  await shotAtWidths(guest, 'guest-setup', { fullPage: true })

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
  // The board shows before the live signal opens the guest's turn, so the hand is waited for first.
  await expect(guest.getByRole('dialog', { name: /secondary missions$/ })).toBeVisible({ timeout: LIVE_MS })
  await takeTheTurn(guest)
  await expect(scoreboard(guest).getByText(`${GUEST}’s turn`, { exact: true })).toBeVisible()
  await shotAtWidths(guest, 'guest-battle', { fullPage: true })
  await playTurn(guest)
  await takeTheTurn(host)
  await expect(host.locator('[data-stat="round"]')).toHaveText('2')

  const concede = guest.getByRole('menuitem', { name: 'Concede battle', exact: true })
  // Whether a scoring prompt opens over the battle depends on the cards dealt, so one is set aside if it did.
  const minimize = guest.getByRole('button', { name: 'Minimize dialog' })
  await expect(async () => {
    if (await concede.isVisible()) return
    if (await minimize.isVisible()) await minimize.click({ timeout: 2_000 })
    await guest.getByRole('button', { name: 'Battle options' }).click({ timeout: 2_000 })
    await expect(concede).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 20_000 })
  await concede.click()
  await guest.getByRole('alertdialog').getByRole('button', { name: 'Concede battle', exact: true }).click()
  await expect(scoreboard(guest).getByRole('heading')).toContainText('wins by concession')

  // The finished game is when signing up is offered, with what it brings.
  const keep = guest.getByRole('region', { name: 'Keep this battle' })
  await expect(keep).toContainText(`${hostName} as a friend`)
  await shotAtWidths(guest, 'keep', { fullPage: true })
  await keep.getByRole('link', { name: 'Create an account' }).click()
  await guest.waitForLoadState('networkidle')
  // The account starts with the name the guest played under, which they can still change.
  await expect(guest.getByLabel('Your name')).toHaveValue(GUEST)
  await guest.getByLabel('Email').fill(`${GUEST.toLowerCase().replace(/[^a-z0-9]+/g, '-')}@example.test`)
  await guest.getByLabel('Password').fill('a-long-enough-password')
  await guest.getByRole('button', { name: 'Create account', exact: true }).click()
  await guest.waitForURL(battleUrl)

  const claim = guest.getByRole('region', { name: 'Add this battle to your record' })
  await shotAtWidths(guest, 'claim', { fullPage: true })
  const written = await loggedCommands(id)
  await claim.getByRole('button', { name: 'Add to my record' }).click()
  const claimed = guest.getByRole('region', { name: 'This battle is in your record' })
  await expect(claimed).toBeVisible()
  // Claiming records who the seat was; the log stays exactly as it was played.
  expect(await loggedCommands(id)).toEqual(written)
  await shotAtWidths(guest, 'claimed', { fullPage: true })
  await claimed.getByRole('button', { name: `Add ${hostName} as a friend` }).click()
  await expect(claimed.getByRole('button', { name: 'Friend request sent' })).toBeVisible()

  // The battle is now one between two accounts, both records hold it, and the account kept the name played under.
  await guest.goto(`/users/${await userIdNamed(GUEST)}`)
  await expect(guest.locator('[data-service-record] [data-record-battles]')).toHaveAttribute('data-record-battles', '1')
  await host.goto(battleUrl)
  await expect(scoreboard(host)).toContainText(GUEST)
  await host.goto('/friends')
  await expect(host.getByText(GUEST).first()).toBeVisible()
})
