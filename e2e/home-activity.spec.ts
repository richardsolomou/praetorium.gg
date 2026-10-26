import { expect, test, type Page } from './test'
import {
  createBattle,
  createRoster,
  followLink,
  PRACTICE_OPPONENT,
  setupBattle,
  signUp,
  uniqueName,
  expectNoPageOverflow,
  PHONE,
  scoreboard,
  retryUntilVisible,
} from './account'
import { productSql, withAuthSql, battleIdFor } from './storage'
import { NATIVE_BROWSER_BRIDGE_SCRIPT } from './native.harness'

/**
 * Opens the signed-out home page with a preview battle as its hero, the most recent public battle.
 *
 * Dated ahead of the public battles other tests open meanwhile, and reloaded past the public feed's short hold.
 */
async function featurePreviewBattle(page: Page, token: string) {
  await productSql`UPDATE battles SET created_at = ${Date.now() + 60 * 60 * 1000} WHERE id = ${await battleIdFor(token)}`
  await expect(async () => {
    await page.goto('/')
    await expect(page.locator('[data-home-featured]')).toHaveAttribute('href', `/battles/${token}`, { timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
}

test('shows the faction icon for an unqualified frozen army', async ({ page }, testInfo) => {
  await signUp(page, uniqueName('Historical faction'))
  // Other tests publish battles meanwhile, so date this one ahead of them to keep it on the shelf.
  await productSql`UPDATE battles SET created_at = ${Date.now() + 30 * 60 * 1000} WHERE token = 'preview-league-battle-doubles'`
  const battle = page.locator('[data-battle-shelf="Public games"] a[href="/battles/preview-league-battle-doubles"]')
  const mark = battle.locator('[data-faction-mark="space-marines"]').first()
  await expect(async () => {
    await page.goto('/')
    await expect(battle).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(mark).toBeVisible()
    await expect(mark).toHaveCSS('mask-image', /faction-icons\/space-marines/)
    expect((await page.request.get('/api/faction-icons/space-marines')).ok()).toBe(true)
    await battle.scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath(`historical-battle-faction-${width}.png`) })
  }
})

test('greets a signed-in player whose provider supplied no name', async ({ page }) => {
  const { email } = await signUp(page, uniqueName('Nameless'))
  await withAuthSql((database) => database.prepare('UPDATE user SET name = ? WHERE email = ?').run('', email))
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome')
  await page.screenshot({ path: test.info().outputPath('home-nameless-greeting.png') })
})

test('offers a secondary account-creation button below sign-in', async ({ page }) => {
  await page.goto('/sign-in?next=%2Frosters')
  const switchAccount = page.getByRole('button', { name: 'I need an account' })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(switchAccount).toBeVisible()
    const switchBounds = await switchAccount.boundingBox()
    const signInBounds = await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).boundingBox()
    expect(switchBounds!.y).toBeGreaterThan(signInBounds!.y + signInBounds!.height)
    expect(switchBounds!.width).toBeLessThan(signInBounds!.width)
    await page.screenshot({ path: test.info().outputPath(`sign-in-account-switch-${width}.png`) })
  }
  await page.setViewportSize({ width: 1440, height: 900 })

  await switchAccount.click()
  await expect(page.getByRole('heading', { name: 'Join Praetorium' })).toBeVisible()
  await expect(page.getByLabel('Your name')).toBeVisible()
  await expect(page).toHaveURL('/sign-in?next=%2Frosters')

  await page.getByRole('button', { name: 'I already have an account' }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible()
  await expect(page.getByLabel('Your name')).toHaveCount(0)
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expectNoPageOverflow(page)
  }
})

/**
 * The home page is the front door for both kinds of visitor.
 *
 * A player who already has games opens it to get back to them; somebody who has
 * never signed in sees only public activity, so a practice battle stays off it.
 */
test('shows active practice battles to their player but not visitors', async ({ page, browser }) => {
  const name = uniqueName('Watcher')
  await signUp(page, name)
  const battleUrl = await createBattle(page, { practice: true })

  await page.goto('/')
  await expect(page.getByRole('heading', { name: `Welcome back, ${name}` })).toBeVisible()
  const battlePath = new URL(battleUrl).pathname
  await expect(page.locator('[data-battle-shelf="Your game"] a').filter({ hasText: PRACTICE_OPPONENT })).toHaveAttribute('href', battlePath)

  const visitor = await browser.newContext()
  const guest = await visitor.newPage()
  try {
    await guest.goto('/')
    await expect(guest.getByRole('main').locator(`a[href="${battlePath}"]`)).toHaveCount(0)
  } finally {
    await visitor.close()
  }
})

test('links each tool a visitor can use without an account as one action', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('link', { name: /Simulate a fight/ })).toHaveAttribute('href', '/simulator')
  await expect(page.getByRole('link', { name: /Read the datasheets/ })).toHaveAttribute('href', '/factions')
  await expect(page.getByRole('link', { name: /Choose a mission/ })).toHaveAttribute('href', '/missions')
  await expect(page.getByRole('link', { name: /Look up a rule/ })).toHaveAttribute('href', '/rules')
})

test('explains supported features before public activity and opens an account-free matchup', async ({ page }) => {
  await page.goto('/')

  const features = page.locator('[data-home-features]')
  for (const name of [
    'Combat simulator',
    'Unlimited lists & variants',
    'Ability reminders',
    'Live battle tracking',
    'Team & practice games',
    'Sealed-roster tournaments',
    'King of the Colosseum',
    'Battle replay & stats',
  ]) {
    await expect(features.getByRole('heading', { name, exact: true })).toBeVisible()
  }
  const activity = page.locator('[data-battle-shelf="Public games"], [data-public-empty]')
  expect((await features.boundingBox())!.y).toBeLessThan((await activity.boundingBox())!.y)
  await page.getByRole('link', { name: /Simulate a fight/ }).click()

  await expect(page).toHaveURL('/simulator')
  await expect(page.getByRole('heading', { name: 'Combat simulator', exact: true })).toBeVisible()
})

test("a visitor's first action opens the builder without an account", async ({ page }) => {
  await page.goto('/')
  await followLink(page.getByRole('link', { name: 'Try the builder', exact: true }), '/rosters')

  await expect(page).toHaveURL('/rosters')
})

test('creating an account from the home page opens the sign-up form', async ({ page }) => {
  await page.goto('/')
  await followLink(page.getByRole('link', { name: 'Create an account', exact: true }).first(), /\/sign-in/)

  await expect(page.getByRole('heading', { name: 'Join Praetorium' })).toBeVisible()
})

test('importing from the home page opens the guest builder', async ({ page }) => {
  await page.goto('/')
  await followLink(page.getByRole('link', { name: 'Try importing a list' }), '/rosters')

  await expect(page).toHaveURL('/rosters')
  await expect(page.getByRole('button', { name: 'Import roster', exact: true })).toBeVisible()
})

test('the home page links to GitHub Sponsors', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('link', { name: 'Sponsor', exact: true })).toHaveAttribute(
    'href',
    'https://github.com/sponsors/richardsolomou',
  )
})

// Each test features its own preview battle on the one shared home page, so they take turns.
test.describe('the featured battle', () => {
  test.describe.configure({ mode: 'default' })

  test('the home page fits a phone at both signed-out and signed-in widths', async ({ page }) => {
    await page.setViewportSize(PHONE)
    await featurePreviewBattle(page, 'preview-casual-doubles')
    await expectNoPageOverflow(page)

    const featuredBattle = page.locator('[data-home-featured]')
    for (const [first, second] of [
      ['Preview Player', 'Preview Ally'],
      ['Preview Opponent', 'Preview Rival'],
    ]) {
      const firstName = featuredBattle.getByText(first, { exact: true })
      const secondName = featuredBattle.getByText(second, { exact: true })
      await expect(firstName).toBeVisible()
      await expect(secondName).toBeVisible()
      expect((await secondName.boundingBox())!.y).toBeGreaterThan((await firstName.boundingBox())!.y)
    }

    await signUp(page, uniqueName('Narrow'))
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expectNoPageOverflow(page)
  })

  test('a finished featured battle omits the repeated result', async ({ page }, testInfo) => {
    await featurePreviewBattle(page, 'preview-league-battle-duel')
    const featured = page.locator('[data-home-featured]')
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await expect(featured).toHaveAttribute('href', '/battles/preview-league-battle-duel')
      await expect(featured.getByText('35', { exact: true })).toBeVisible()
      await expect(featured).not.toContainText('wins')
      await featured.scrollIntoViewIfNeeded()
      await page.screenshot({ path: testInfo.outputPath(`finished-featured-battle-${width}.png`) })
    }
  })
})

test('offers native notification permission on home and retries device setup', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await page.addInitScript({
    content: `window.ReactNativeWebView = {
      postMessage(message) {
        const request = JSON.parse(message);
        if (request.type !== 'native-push') return;
        const fail = request.prompt && localStorage.getItem('e2e-push-fail-once') === 'true';
        if (request.prompt) localStorage.setItem('e2e-push-granted', 'true');
        if (fail) localStorage.removeItem('e2e-push-fail-once');
        const answer = fail
          ? { status: 'unavailable' }
          : localStorage.getItem('e2e-push-granted') === 'true'
            ? { status: 'granted', token: 'ExponentPushToken[e2e-device]', platform: 'ios' }
            : { status: 'undetermined' };
        queueMicrotask(() => window.dispatchEvent(new CustomEvent('praetorium-native-push', {
          detail: { id: request.id, ...answer }
        })));
      }
    };
    ${NATIVE_BROWSER_BRIDGE_SCRIPT}`,
  })
  await signUp(page, uniqueName('Notified'))
  await page.goto('/profile')
  await expect(page.getByText('Notifications on your phone')).toHaveCount(0)
  await expect(page.getByRole('switch', { name: 'Send notifications to my devices' })).toHaveCount(0)
  await page.goto('/')

  const offer = page.getByRole('region', { name: 'Notifications' })
  await expect(offer.getByRole('button', { name: 'Allow notifications' })).toBeVisible()
  await expectNoPageOverflow(page)
  await page.screenshot({ path: test.info().outputPath('home-notification-offer.png') })

  await offer.getByRole('button', { name: 'Not now' }).click()
  await page.reload()
  await expect(offer).toHaveCount(0)

  await page.evaluate(() => {
    localStorage.removeItem('praetorium-notifications-dismissed')
    localStorage.setItem('e2e-push-fail-once', 'true')
  })
  await page.reload()
  await offer.getByRole('button', { name: 'Allow notifications' }).click()
  await expect(offer.getByRole('button', { name: 'Retry notifications' })).toBeVisible()
  await expect(offer.getByText('This device could not be set up for notifications.')).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('home-notification-retry.png') })
  await offer.getByRole('button', { name: 'Retry notifications' }).click()
  await expect(offer).toHaveCount(0)
  await page.goto('/profile')
  await expect(page.getByText('Notifications on your phone')).toHaveCount(0)
  await expect(page.getByRole('switch', { name: 'Send notifications to my devices' })).toHaveCount(0)
})

test('omits the games shelf when the player has no active game', async ({ page }) => {
  await signUp(page, uniqueName('Idle'))
  await page.goto('/')

  await expect(page.locator('[data-battle-shelf="Your game"], [data-battle-shelf="Your games"]')).toHaveCount(0)
  await expect(page.locator('[data-home-rosters]')).toBeVisible()
  await expect(page.locator('[data-home-record], [aria-label="Loading your record"]')).toHaveCount(0)
  await expect(page.getByRole('main').getByText('Public games', { exact: true })).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('home-no-active-game.png') })
})

/**
 * The signed-in home page runs outwards from the reader.
 *
 * The order is the whole point of the page: the games waiting on the player, then
 * the ones they have finished, then their friends' tables, then everybody else's.
 * A finished game in the first shelf would put a game nobody can act on above one
 * that is live.
 */
test('orders the signed-in home page from the player outwards', async ({ browser }) => {
  const hostContext = await browser.newContext()
  const guestContext = await browser.newContext()
  const host = await hostContext.newPage()
  const guest = await guestContext.newPage()
  const hostName = uniqueName('Host')
  const guestName = uniqueName('Guest')
  try {
    await signUp(guest, guestName)
    const guestRoster = await createRoster(guest, { faction: 'Death Guard', detachment: /Shamblerot Vectorium/, name: 'Guest list' })
    await signUp(host, hostName)
    const hostRoster = await createRoster(host, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Host list' })

    const played = await setupBattle(host, guest, { opponent: guestName, hostRoster, guestRoster })
    await host.getByRole('button', { name: 'Battle options' }).click()
    await host.getByRole('menuitem', { name: 'Concede battle' }).click()
    await host.getByRole('alertdialog').getByRole('button', { name: 'Concede battle' }).click()
    await expect(scoreboard(host).getByRole('heading')).toContainText('wins by concession')
    // The record arrives in the server's HTML, not after hydration.
    await expect.poll(async () => (await (await host.request.get('/')).text()).includes('data-home-record')).toBe(true)
    await host.goto('/')
    const idleHistory = host.locator('[data-battle-shelf="Games you have played"]')
    await expect(idleHistory.locator(`a[href="${new URL(played).pathname}"]`)).toHaveCount(1)
    expect((await idleHistory.boundingBox())!.x).toBeLessThan((await host.locator('[data-home-rosters]').boundingBox())!.x)
    await host.setViewportSize(PHONE)
    expect((await host.locator('[data-home-rosters]').boundingBox())!.y).toBeLessThan((await idleHistory.boundingBox())!.y)
    await expectNoPageOverflow(host)
    await host.setViewportSize({ width: 1440, height: 900 })

    // A second table, still being set, so the live shelf and the history shelf are both on the page.
    const going = await createBattle(host, { opponent: guestName })

    await host.goto('/')
    await expect(host.getByRole('heading', { name: `Welcome back, ${hostName}` })).toBeVisible()
    const rubrics = host.locator('main').getByText(/^(Your game|Games you have played|Friends' games|Public games)$/)
    await expect(rubrics).toHaveText(['Your game', 'Games you have played', "Friends' games", 'Public games'])

    await expect(host.locator('[data-home-rosters]').getByRole('link', { name: /Host list/ })).toHaveCount(1)
    await expect(host.locator('[data-home-rosters]').getByRole('link', { name: 'Data updates' })).toHaveCount(0)
    await expect(host.getByRole('contentinfo').getByRole('link', { name: 'Data updates' })).toHaveCount(1)

    const yours = host.locator('[data-battle-shelf="Your game"]')
    const history = host.locator('[data-battle-shelf="Games you have played"]')
    await expect(yours.locator(`a[href="${new URL(going).pathname}"]`)).toHaveCount(1)
    await expect(yours.locator(`a[href="${new URL(played).pathname}"]`)).toHaveCount(0)
    await expect(history.locator(`a[href="${new URL(played).pathname}"]`)).toHaveCount(1)
    await expect(history.locator(`a[href="${new URL(going).pathname}"]`)).toHaveCount(0)
    expect((await history.boundingBox())!.x).toBeLessThan((await host.locator('[data-home-rosters]').boundingBox())!.x)
    expect((await history.boundingBox())!.y).toBeGreaterThan((await yours.boundingBox())!.y)
    await host.setViewportSize(PHONE)
    expect((await yours.boundingBox())!.y).toBeLessThan((await host.locator('[data-home-rosters]').boundingBox())!.y)
    expect((await host.locator('[data-home-rosters]').boundingBox())!.y).toBeLessThan((await history.boundingBox())!.y)
    await expectNoPageOverflow(host)
  } finally {
    await Promise.all([hostContext.close(), guestContext.close()])
  }
})

test('the leaderboard fits a phone', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await page.goto('/leaderboard')

  await expect(page.locator('h1').first()).toHaveText('Leaderboard')
  await expectNoPageOverflow(page)
})

/**
 * Choosing a faction navigates, so the table it opens has an address to send.
 *
 * The control is a combobox rather than component state for exactly this reason,
 * and only a browser can prove the choice reaches the URL and the table. The open
 * is retried because this is the first interaction after a navigation, and a click
 * that lands before hydration is swallowed rather than failing.
 */
test('the leaderboard gives each faction table an address', async ({ page }) => {
  await page.goto('/leaderboard')
  const chooser = page.getByRole('combobox', { name: 'Faction' })
  await retryUntilVisible(page.getByRole('option').first(), () => chooser.click())

  // Whichever faction the seeded battles produced: the list is what has been played.
  const faction = page.getByRole('option').nth(1)
  const name = ((await faction.textContent()) ?? '').trim()
  await faction.click()

  await expect(page).toHaveURL(/\/leaderboard\?faction=/)
  await expect(page.locator('[data-standings] h2')).toContainText(name)
})

/**
 * A profile answers a visitor with no account, and only with battles they may watch.
 *
 * The page is reached from the leaderboard. Only a browser proves the whole chain: the
 * row links to the profile, the profile renders signed out, and its record is folded
 * rather than empty.
 */
test('a signed-out visitor opens a player profile from the leaderboard', async ({ page }) => {
  await page.goto('/leaderboard')
  const first = page.locator('[data-standing] a').first()
  // Scoped to the name span: the avatar draws an initial inside the same link.
  const name = ((await first.locator('.truncate').textContent()) ?? '').trim()
  await first.click()

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name, { ignoreCase: true })
  // The record is the tab a profile opens on, so it is on screen without a click.
  await expect(page.getByRole('tab', { selected: true })).toHaveText('Record')
  await expect(page.locator('[data-service-record]')).toContainText('Service record')
  await expect(page.locator('[data-rankings]')).toContainText('Everyone')

  // The panel is controlled by the address, so a tab click before hydration moves nothing.
  await followLink(page.getByRole('tab', { name: /battles/i }), /tab=battles/)
  await expect(page.locator('[data-battle-shelf]')).toBeVisible()
})

test('a player profile fits a phone', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await page.goto('/leaderboard')
  await page.locator('[data-standing] a').first().click()
  await expect(page.locator('[data-service-record]')).toBeVisible()

  await expectNoPageOverflow(page)
})
