import fs from 'node:fs'
import { join } from 'node:path'
import { devices, expect, type Page, test } from '@playwright/test'
import { NATIVE_BROWSER_BRIDGE_SCRIPT } from './native.harness'
import { createRoster, retryUntilVisible, signUp } from './account'
import { catalogue } from './stackEnv'

test('a standalone datasheet omits detachment-only abilities', async ({ page }) => {
  await page.goto('/factions/necrons/datasheets/ctan-shard-of-the-nightbringer')
  await expect(page.getByRole('heading', { name: "C'tan Shard of the Nightbringer", exact: true })).toBeVisible()

  await expect(page.getByText('Distortion Fields (Aura)', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Quantum Goad', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: /Detachment abilities/ })).toHaveCount(0)
})

test('the mobile website uses application navigation below 860 pixels', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  await expect(page.locator('head link[rel="icon"]')).toHaveAttribute('href', '/favicon.svg')
  await expect(page.locator('head link[rel="preload"][as="font"]')).toHaveCount(3)
  expect(await page.evaluate(() => document.fonts.check('400 16px "Sofia Sans Semi Condensed Variable"'))).toBe(true)
  const primary = page.locator('#primary-navigation')
  const webHeader = page.locator('[data-web-app-chrome]')
  const mobileHeader = page.locator('[data-mobile-app-header]')
  const sections = page.getByRole('navigation', { name: 'Application sections' })
  const more = sections.getByRole('link', { name: 'More' })
  await expect(webHeader).toBeHidden()
  await expect(mobileHeader).toBeVisible()
  await expect(mobileHeader).toHaveCSS('position', 'fixed')
  expect(await page.locator('[data-mobile-app-header-spacer]').evaluate((element) => element.getBoundingClientRect().height)).toBe(
    await mobileHeader.evaluate((element) => element.getBoundingClientRect().height),
  )
  await expect(mobileHeader.getByRole('link', { name: 'Praetorium home' })).toBeVisible()
  await expect(mobileHeader.getByRole('button', { name: 'Search Praetorium' })).toBeVisible()
  await expect(mobileHeader.getByRole('button', { name: 'Account menu' })).toBeVisible()
  await expect(primary).toBeHidden()
  await expect(sections).toBeVisible()
  await expect(sections.getByRole('link')).toHaveText(['Rosters', 'Battles', 'Factions', 'Missions', 'More'])
  await expect(sections.locator('[aria-current="page"]')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/navigation-phone.png', fullPage: true })

  await more.click()
  await expect(page).toHaveURL('/more')
  await expect(more).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('link', { name: /^Home/ })).toBeVisible()
  expect(
    await page
      .locator('main #more-navigation-heading + div a')
      .evaluateAll((links) => links.map((link) => new URL((link as HTMLAnchorElement).href).pathname)),
  ).toEqual(['/', '/leagues', '/leaderboard', '/force-dispositions', '/rules', '/simulator', '/data-updates'])
  await page.screenshot({ path: 'test-results/more-phone.png' })
  await mobileHeader.getByRole('button', { name: 'Search Praetorium' }).click()
  await expect(page.getByPlaceholder('Search everything…')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(page.getByPlaceholder('Search everything…')).toHaveCount(0)

  await sections.getByRole('link', { name: 'Rosters' }).click()
  await expect(page.getByRole('button', { name: 'Go back' })).toHaveCount(0)
  await page.setViewportSize({ width: 320, height: 568 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)

  await sections.getByRole('link', { name: 'Missions' }).click()
  await expect(page).toHaveURL(/\/missions\//)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('main').getByRole('link', { name: 'Force dispositions' })).toBeVisible()
  await page.screenshot({ path: 'test-results/mission-reference-phone.png' })
  await page.getByRole('main').getByRole('link', { name: 'Force dispositions' }).click()
  await expect(page).toHaveURL('/force-dispositions')
  await expect(sections.getByRole('link', { name: 'Missions' })).toHaveAttribute('aria-current', 'page')

  await page.setViewportSize({ width: 859, height: 844 })
  await expect(webHeader).toBeHidden()
  await expect(mobileHeader).toBeVisible()
  await expect(sections).toBeVisible()
  await page.setViewportSize({ width: 860, height: 844 })
  await expect(page.getByRole('button', { name: 'Open primary navigation' })).toBeHidden()
  await expect(primary).toBeVisible()
  await expect(primary.getByRole('link', { name: 'Rosters' }).locator('svg')).toHaveCount(1)
  expect(
    await primary.getByRole('button', { name: 'Reference' }).evaluate((button) => button.getBoundingClientRect().left),
  ).toBeGreaterThan(await primary.getByRole('link', { name: 'Simulator' }).evaluate((link) => link.getBoundingClientRect().left))
  await page.screenshot({ path: 'test-results/navigation-desktop-860.png' })
  await primary.getByRole('button', { name: 'Reference' }).click()
  await expect(page.getByRole('menuitem', { name: 'Force dispositions' })).toBeVisible()
  await expect(page.getByRole('menuitem')).toHaveText(['Factions', 'Missions', 'Force dispositions', 'Rules'])
  await expect(page.getByRole('menuitem', { name: 'Force dispositions' }).locator('svg')).toHaveCount(1)
  await page.screenshot({ path: 'test-results/navigation-desktop-menu.png' })
  await page.getByRole('menuitem', { name: 'Force dispositions' }).click()
  await expect(page).toHaveURL('/force-dispositions')
  await expect(primary.getByRole('button', { name: 'Reference' })).toHaveClass(/text-parchment/)
  await expect(sections).toBeHidden()
  await expect(mobileHeader).toBeHidden()
  await expect(webHeader).toHaveJSProperty('scrollWidth', await webHeader.evaluate((header) => header.clientWidth))

  // The wordmark and the wider gap arrive at 1000, which is the other width the
  // seven navigation items have to fit inside.
  await page.setViewportSize({ width: 999, height: 844 })
  await expect(webHeader).toHaveJSProperty('scrollWidth', await webHeader.evaluate((header) => header.clientWidth))
  await page.setViewportSize({ width: 1000, height: 844 })
  await expect(webHeader).toHaveJSProperty('scrollWidth', await webHeader.evaluate((header) => header.clientWidth))
  await page.screenshot({ path: 'test-results/navigation-desktop-1000.png' })
})

test('the native application has stable route-aware phone and tablet navigation', async ({ browser }) => {
  const loadingContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await loadingContext.addInitScript({
    content: `window.ReactNativeWebView = { postMessage: () => {} };
${NATIVE_BROWSER_BRIDGE_SCRIPT}`,
  })
  const loadingPage = await loadingContext.newPage()
  await loadingPage.route('**/*', (route) => (route.request().resourceType() === 'script' ? route.abort() : route.continue()))
  await loadingPage.goto('/factions/necrons/datasheets/overlord')
  await expect(loadingPage.locator('[data-web-app-chrome]')).toBeHidden()
  await expect(loadingPage.locator('[data-mobile-app-header]')).toBeVisible()
  await expect(loadingPage.locator('[data-native-app-header]')).toHaveCount(0)
  await expect(loadingPage.locator('[data-native-app-tabs]')).toBeVisible()
  expect(await loadingPage.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await loadingPage.setViewportSize({ width: 1024, height: 768 })
  expect(await loadingPage.evaluate(() => document.documentElement.scrollWidth)).toBe(1024)
  await loadingContext.close()

  const legacyContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await legacyContext.addInitScript({
    content: `window.ReactNativeWebView = { postMessage: () => {} };
${NATIVE_BROWSER_BRIDGE_SCRIPT}
document.addEventListener('DOMContentLoaded', () => { document.documentElement.dataset.nativeShell = 'true' }, { once: true });`,
  })
  const legacyPage = await legacyContext.newPage()
  await legacyPage.goto('/factions')
  await expect(legacyPage.locator('[data-native-app-header]')).toHaveCount(0)
  await expect(legacyPage.locator('[data-mobile-app-header]')).toBeHidden()
  await expect(legacyPage.locator('[data-native-app-tabs]')).toBeHidden()
  await legacyContext.close()

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript({
    content: `window.ReactNativeWebView = { postMessage: () => {} };
${NATIVE_BROWSER_BRIDGE_SCRIPT}`,
  })
  const page = await context.newPage()
  const hydrationErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' && /hydrat/i.test(message.text())) hydrationErrors.push(message.text())
  })
  await page.goto('/force-dispositions/take-and-hold')
  await expect(page.getByRole('heading', { name: 'Take and Hold', exact: true })).toBeVisible()
  await expect(page.locator('a[href="/missions/chapter-approved-2026-2027/matchups/take-and-hold/disruption"]')).toContainText(
    'Determined Acquisition',
  )
  await expect(page.locator('a[href="/factions/necrons/detachments/awakened-dynasty"]')).toHaveCount(1)
  await expect(page).toHaveTitle(/Take and Hold force disposition — Praetorium/)
  await expectCanonical(page, '/force-dispositions/take-and-hold')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.setViewportSize({ width: 1_440, height: 900 })

  await page.goto('/factions/necrons/datasheets/overlord')

  const webHeader = page.locator('[data-web-app-chrome]')
  const mobileHeader = page.locator('[data-mobile-app-header]')
  const sections = page.getByRole('navigation', { name: 'Application sections' })
  const more = sections.getByRole('link', { name: 'More' })
  await expect(webHeader).toBeHidden()
  await expect(mobileHeader).toBeVisible()
  await expect(mobileHeader).toHaveCSS('position', 'fixed')
  await expect(page.getByRole('banner', { name: 'Application' })).toHaveCount(0)
  await expect(sections).toBeVisible()
  await expect(sections.getByRole('link', { name: 'Factions' })).toHaveAttribute('aria-current', 'page')
  await expect(sections.getByRole('link', { name: 'Battles' })).toBeVisible()
  await expect(sections.getByRole('link', { name: 'Rosters' })).toBeVisible()
  await expect(sections.getByRole('link', { name: 'Missions' })).toBeVisible()
  await expect(sections.getByRole('link', { name: 'Leagues' })).toHaveCount(0)
  expect((await more.boundingBox())?.width).toBeGreaterThanOrEqual(44)
  expect(hydrationErrors).toEqual([])
  await page.screenshot({ path: 'test-results/native-navigation-phone.png', fullPage: true })

  await more.click()
  await expect(page).toHaveURL('/more')
  const morePage = page.getByRole('main')
  await expect(morePage.getByRole('heading', { name: 'More' })).toBeVisible()
  await expect(morePage.getByRole('link', { name: /^Leagues/ })).toBeVisible()
  await expect(morePage.getByRole('link', { name: /^Leaderboard/ })).toBeVisible()
  await expect(morePage.getByRole('link', { name: /^Rules/ })).toBeVisible()
  await expect(morePage.getByRole('link', { name: /^Dispositions/ })).toBeVisible()
  await expect(morePage.getByRole('button', { name: 'Search Praetorium' })).toHaveCount(0)
  await expect(morePage.getByRole('link', { name: /^Sign in/ })).toHaveCount(0)
  await expect(mobileHeader.getByRole('button', { name: 'Search Praetorium' })).toBeVisible()
  await expect(mobileHeader.getByRole('button', { name: 'Account menu' })).toBeVisible()
  await expect(morePage.getByRole('button', { name: /^Back/ })).toHaveCount(0)
  await expect(sections.getByRole('link', { name: 'Factions' })).not.toHaveAttribute('aria-current', 'page')
  await expect(more).toHaveAttribute('aria-current', 'page')
  await page.screenshot({ path: 'test-results/native-navigation-more.png' })

  await mobileHeader.getByRole('button', { name: 'Search Praetorium' }).click()
  await page.getByPlaceholder('Search everything…').fill('Overlord')
  await page
    .getByRole('option', { name: /Overlord/ })
    .first()
    .click()
  await expect(page).toHaveURL('/factions/necrons/datasheets/overlord')

  await more.click()
  await expect(page).toHaveURL('/more')
  await morePage.getByRole('link', { name: /^Rules/ }).click()
  await expect(page).toHaveURL('/rules')
  await expect(more).toHaveAttribute('aria-current', 'page')
  await more.click()
  await morePage.getByRole('link', { name: /^Leagues/ }).click()
  await expect(page).toHaveURL('/leagues')

  await page.setViewportSize({ width: 1024, height: 768 })
  await expect(sections).toHaveCSS('flex-direction', 'column')
  expect((await sections.boundingBox())?.x).toBe(0)
  expect((await page.locator('[data-native-app-content]').boundingBox())?.x).toBeGreaterThanOrEqual(80)
  await more.click()
  await expect(page).toHaveURL('/more')
  expect((await morePage.boundingBox())?.x).toBeGreaterThanOrEqual(80)
  await expect(morePage.getByRole('link', { name: /^Leaderboard/ })).toBeVisible()
  await page.screenshot({ path: 'test-results/native-navigation-tablet.png', fullPage: true })

  await context.close()
})

test('a signed-in player cannot return to the sign-in form', async ({ page }) => {
  const name = 'No stale sign in'
  const credentials = await signUp(page, name)

  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toHaveCount(0)
  await expect(page).not.toHaveURL(/\/sign-in/)

  await page.goto('/sign-in')
  await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toHaveCount(0)
  await expect(page).not.toHaveURL(/\/sign-in/)

  await page.getByRole('button', { name: `Account menu for ${name}` }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await page.goto('/support')
  await page.goto('/sign-in?next=%2Ffactions')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Email').fill(credentials.email)
  await page.getByLabel('Password').fill(credentials.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL('/factions')
  await page.goBack()
  await expect(page).toHaveURL('/support')
  await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toHaveCount(0)
})

/** A page's canonical link is absolute, on the origin that served it, and its Open Graph address is the same. */
async function expectCanonical(page: Page, path: string) {
  const href = new URL(path, page.url()).href
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', href)
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', href)
}

test('public reference data renders without client JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()

  await page.goto('/sign-in?next=%2Ffactions')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
  await page.goto('/factions')
  await expect(page.locator('[data-faction="Chaos Daemons"]')).toBeVisible()
  await page.goto('/factions/necrons')
  await expect(page.locator('a[href="/factions/necrons/detachments/awakened-dynasty"]')).toHaveCount(1)
  await page.goto('/missions')
  await expect(page).toHaveURL(/\/missions\/.+/)
  await expect(page.getByRole('heading', { name: 'Chapter Approved 2026-2027' })).toBeVisible()
  await expect(page.locator('#matrix')).toContainText('Disruption')
  const fixedSecondary = page.locator('a[href*="/secondaries/"]').filter({ hasText: 'Assassination' })
  const tacticalSecondary = page.locator('a[href*="/secondaries/"]').filter({ hasText: 'Forward Position' })
  await expect(fixedSecondary).toContainText('Fixed')
  await expect(tacticalSecondary).toBeVisible()
  await expect(tacticalSecondary).not.toContainText('Fixed')
  const assassinationPath = (await fixedSecondary.getAttribute('href'))!
  await expect(page.getByRole('heading', { name: 'Mission twists' })).toBeVisible()
  await expect(page).toHaveTitle(/Chapter Approved 2026-2027 missions — Praetorium/)
  await expectCanonical(page, '/missions/chapter-approved-2026-2027')

  await page.getByRole('link', { name: 'Force dispositions', exact: true }).click()
  await expect(page).toHaveURL('/force-dispositions')
  await expect(page.getByRole('heading', { name: 'Force dispositions', exact: true })).toBeVisible()
  await expect(page.locator('a[href="/force-dispositions/take-and-hold"]')).toContainText('Take and Hold')
  await expectCanonical(page, '/force-dispositions')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.screenshot({ path: 'test-results/force-dispositions-phone.png', fullPage: true })
  await page.setViewportSize({ width: 1_440, height: 900 })
  await page.goBack()

  const secondaryLink = page.locator('a[href*="/secondaries/"]').first()
  const secondaryName = (await secondaryLink.locator('span').first().textContent())!
  const secondaryPath = await secondaryLink.getAttribute('href')
  await page.goto(secondaryPath!)
  await expect(page.getByRole('heading', { name: secondaryName, exact: true })).toBeVisible()
  await expectCanonical(page, secondaryPath!)
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/secondary-mission-mobile.png', fullPage: true })
  await page.setViewportSize({ width: 1_440, height: 900 })

  await page.goto('/missions/chapter-approved-2026-2027/matchups/disruption/take-and-hold')
  const deathTrap = page.getByRole('heading', { name: 'Death Trap', exact: true }).locator('..')
  await expect(deathTrap).toContainText('For each terrain area trapped this turn.')
  const missionId = await deathTrap.getAttribute('id')
  expect(missionId).toMatch(/^mission-/)
  await page.goto(`/missions/chapter-approved-2026-2027/matchups/disruption/take-and-hold#${missionId}`)
  await expect(page.locator(`#${missionId}`)).toBeVisible()
  await expect(page.locator('[id^="terrain-"]').first()).toBeAttached()
  await expect(page.locator('[id^="deployment-"]').first()).toBeAttached()
  await expect(page).toHaveTitle(/Disruption vs Take and Hold — Chapter Approved 2026-2027 — Praetorium/)
  await expectCanonical(page, '/missions/chapter-approved-2026-2027/matchups/disruption/take-and-hold')

  await page.goto('/mission-packs')
  await expect(page).toHaveURL('/missions/chapter-approved-2026-2027')
  await page.goto('/mission-packs/chapter-approved-2026-2027')
  await expect(page).toHaveURL('/missions/chapter-approved-2026-2027')
  for (const published of [
    '/missions/chapter-approved-2026-2027/secondaries/assassination',
    '/mission-packs/chapter-approved-2026-2027/secondary-missions/assassination',
  ]) {
    await page.goto(published)
    await expect(page).toHaveURL(assassinationPath)
    await expect(page.getByRole('heading', { name: 'Assassination', exact: true })).toBeVisible()
  }
  await page.goto(`/mission-matchups/chapter-approved-2026-2027/disruption/take-and-hold#${missionId}`)
  await expect(page).toHaveURL(`/missions/chapter-approved-2026-2027/matchups/disruption/take-and-hold#${missionId}`)

  await page.goto('/factions/necrons/datasheets/overlord')
  await expect(page.getByRole('heading', { name: 'Overlord', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'My Will Be Done' })).toBeVisible()
  await expect(page).toHaveTitle(/^Overlord datasheet \(\d+ pts\) — Necrons — Praetorium$/)
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
    'content',
    /^Overlord datasheet for Necrons\. 1 model for \d+ pts\..*Profiles, weapons, abilities and wargear/,
  )
  await expectCanonical(page, '/factions/necrons/datasheets/overlord')
  await expect(page.locator('link[rel="alternate"][type="text/markdown"]')).toHaveAttribute(
    'href',
    /\/api\/reference\/v1\/datasheets\/[^/]+\/overlord\?format=markdown$/,
  )

  await page.goto('/factions/necrons/detachments/cryptek-conclave')
  await expect(page.getByRole('heading', { name: 'Cryptek Conclave', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Technosorcerous Augmentations' })).toBeVisible()
  await expect(page).toHaveTitle(/Cryptek Conclave detachment — Necrons — Praetorium/)
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', /Cryptek Conclave rules, enhancements/)
  await expectCanonical(page, '/factions/necrons/detachments/cryptek-conclave')

  await page.goto('/rules/core-rules/movement-phase')
  await expect(page.getByRole('heading', { name: 'Movement Phase', exact: true })).toBeVisible()
  await expect(page.locator('[id="09.00"]')).toContainText('In the Movement phase')
  await expect(page).toHaveTitle(/Movement Phase — Core Rules — Praetorium/)
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', /Movement Phase from Core Rules/)
  await expectCanonical(page, '/rules/core-rules/movement-phase')

  await context.close()
})

test('rule tooltips open on touch and hover', async ({ browser, page }) => {
  const context = await browser.newContext(devices['iPhone 13'])
  const touchPage = await context.newPage()

  await touchPage.goto('/factions/necrons/detachments/hand-of-the-dynasty')
  await touchPage.waitForLoadState('networkidle')
  const tooltip = touchPage.getByRole('tooltip')
  await touchPage.getByRole('button', { name: '[RAPID FIRE 1]' }).tap()
  await expect(tooltip).toContainText('Rapid Fire')
  await touchPage.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await expect(tooltip).toContainText('Rapid Fire')
  await touchPage.screenshot({ path: 'test-results/rule-tooltip-touch.png', fullPage: true })
  await touchPage.getByRole('heading', { name: 'Hand of the Dynasty', exact: true }).tap()
  await expect(touchPage.getByRole('tooltip')).toHaveCount(0)

  await context.close()

  await page.goto('/factions/necrons/detachments/hand-of-the-dynasty')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: '[RAPID FIRE 1]' }).hover()
  await expect(page.getByRole('tooltip')).toContainText('Rapid Fire')
  await page.screenshot({ path: 'test-results/rule-tooltip-hover.png', fullPage: true })
  await page.getByRole('heading', { name: 'Hand of the Dynasty', exact: true }).hover()
  await expect(page.getByRole('tooltip')).toHaveCount(0)

  await page.getByRole('button', { name: '[RAPID FIRE 1]' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('tooltip')).toContainText('Rapid Fire')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('tooltip')).toHaveCount(0)
})

test('server-rendered reference pages keep route-shaped payloads', async ({ request }) => {
  const factions = await (await request.get('/factions')).body()
  const missionPack = await (await request.get('/missions/chapter-approved-2026-2027')).body()
  // One section, never the five documents: the whole rules corpus is far larger.
  const ruleSection = await (await request.get('/rules/core-rules/movement-phase')).body()

  expect(factions.byteLength).toBeLessThan(250_000)
  expect(missionPack.byteLength).toBeLessThan(250_000)
  expect(ruleSection.byteLength).toBeLessThan(250_000)
})

test('a rule is read by the number the source prints against it', async ({ browser, page }) => {
  await page.goto('/rules')
  await page.locator('a[href="/rules/core-rules"]').first().click()
  await expect(page).toHaveURL('/rules/core-rules')

  await page.locator('a[href="/rules/core-rules/movement-phase"]').first().click()
  await expect(page).toHaveURL('/rules/core-rules/movement-phase')
  const remainStationary = page.locator('[id="09.04"]')
  await expect(remainStationary).toContainText(/remain stationary/i)
  // A movement behaviour states its own fields, and one the source writes as a dash is
  // not a rule: that is how it states Remain Stationary's maximum distance.
  await expect(remainStationary).toContainText(/eligible if/i)
  await expect(remainStationary).not.toContainText(/maximum distance/i)
  // The printed rulebook's photography is not republished.
  await expect(page.locator('main img')).toHaveCount(0)

  // A rule that quotes another rule's number links to it.
  await page.locator('a[href="/rules/core-rules/movement-phase#09.04"]').first().click()
  await expect(page).toHaveURL('/rules/core-rules/movement-phase#09.04')
  await page.screenshot({ path: 'test-results/rules-section.png', fullPage: true })

  // The source emphasises its examples in Markdown, which is read rather than shown.
  await page.goto('/rules/core-rules/terrain')
  const example = page.locator('p', { hasText: 'All sections of the' }).first()
  await expect(example).toContainText('terrain feature (A) are more than')
  await expect(example.locator('strong em')).not.toHaveCount(0)
  expect(await page.locator('main').innerText()).not.toContain('***')

  // A clarification stays collapsed until the address names it.
  await page.goto('/rules/core-rules/core-concepts')
  const clarification = page.locator('[id="01.02.03"]')
  expect(await clarification.evaluate((element: HTMLDetailsElement) => element.open)).toBe(false)
  await page.goto('/rules/core-rules/core-concepts#01.02.03')
  await expect.poll(() => clarification.evaluate((element: HTMLDetailsElement) => element.open)).toBe(true)

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const mobilePage = await mobileContext.newPage()
  await mobilePage.goto('/rules/core-rules/core-abilities#24.33')
  await mobilePage.waitForTimeout(3_100)
  await expect(mobilePage.locator('[id="24.33"]')).toBeInViewport()
  await mobilePage.screenshot({ path: 'test-results/rules-anchor-phone.png' })
  await mobileContext.close()

  // The filter answers a number as well as a name, because one rule quotes the other.
  await page.goto('/rules')
  await page.getByLabel('Find a rule').fill('09.04')
  await expect(page.locator('a[href="/rules/core-rules/movement-phase#09.04"]')).toHaveCount(1)

  await page.getByRole('button', { name: 'Search Praetorium' }).click()
  await page.getByPlaceholder('Search everything…').fill('coherency')
  await page
    .getByRole('option', { name: /Coherency/ })
    .first()
    .click()
  await expect(page).toHaveURL('/rules/core-rules/moving#03.03')
})

test('a datasheet shows attachment keywords and lists their targets once', async ({ page }) => {
  await page.goto('/factions/necrons/datasheets/overlord')

  await expect(page.getByRole('heading', { name: 'Attachments' })).toBeVisible()
  await expect(page.getByText('Can lead', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Leader', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Leader', exact: true })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/datasheet-leader-attachments.png', fullPage: true })

  await page.goto('/factions/necrons/datasheets/plasmancer')
  await expect(page.getByRole('button', { name: 'Support', exact: true })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'test-results/datasheet-leader-attachments-phone.png', fullPage: true })
})

test('the faction page shows its army rule in full', async ({ page }) => {
  await page.goto('/factions/necrons')

  const armyRule = page.getByRole('heading', { name: 'Reanimation Protocols', exact: true }).locator('..')
  await expect(armyRule).toContainText('activates its Reanimation Protocols')
  await expect(page.getByRole('button', { name: 'Reanimation Protocols', exact: true })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/faction-army-rule.png', fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'test-results/faction-army-rule-phone.png', fullPage: true })

  await page.goto('/factions/necrons/datasheets/overlord')
  await expect(page.getByRole('button', { name: 'Reanimation Protocols', exact: true })).toBeVisible()
})

test('opening faction datasheets does not render the route error boundary', async ({ page }) => {
  await page.goto('/factions/dark-angels')
  await page.evaluate(() => {
    document.documentElement.dataset.routeErrorSeen = 'false'
    new MutationObserver((mutations) => {
      const changed = mutations.flatMap((mutation) => [mutation.target, ...mutation.addedNodes])
      if (changed.some((node) => node.textContent?.includes('Something went wrong'))) {
        document.documentElement.dataset.routeErrorSeen = 'true'
      }
    }).observe(document.body, { characterData: true, childList: true, subtree: true })
  })

  await page.getByRole('link', { name: /Datasheets/ }).click()
  await expect(page.getByLabel('Find a datasheet')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-route-error-seen', 'false')
  await page.screenshot({ path: 'test-results/faction-datasheets-first-load.png', fullPage: true })
})

test('signed-out faction browsing does not load account collection data before background warming', async ({ page }) => {
  await page.addInitScript(() => {
    window.requestIdleCallback = () => 1
  })
  const serverReads: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'GET' && request.url().includes('/_serverFn/')) serverReads.push(request.url())
  })

  await page.goto('/factions/necrons/datasheets')
  await expect(page.getByRole('heading', { name: 'Datasheets' })).toBeVisible()
  await page.waitForTimeout(500)
  expect(serverReads).toHaveLength(0)
})

for (const [path, name] of [
  ['/factions/necrons/datasheets/overlord', 'Sign in to add Overlord to your collection'],
  ['/factions/necrons', 'Sign in to add Necrons to favourites'],
  ['/factions/necrons/detachments/cryptek-conclave', 'Sign in to add Cryptek Conclave to favourite detachments'],
] as const) {
  test(`crawlers are asked not to follow the sign-in link on ${path}`, async ({ page }) => {
    await page.goto(path)
    await expect(page.getByRole('link', { name })).toHaveAttribute('rel', 'nofollow')
  })
}

test('saving a faction asks signed-out visitors to sign in', async ({ page }) => {
  await page.goto('/factions')
  await page.getByRole('link', { name: 'Sign in to add Necrons to favourites' }).click()
  await expect(page).toHaveURL('/sign-in?next=%2Ffactions')
})

test('the old sign-in URL preserves its destination', async ({ page }) => {
  await page.goto('/signin?next=%2Ffactions')

  await expect(page).toHaveURL('/sign-in?next=%2Ffactions')
})

test('an invalid password reset link explains how to recover', async ({ page }) => {
  await page.goto('/reset-password?error=INVALID_TOKEN')

  await expect(page.getByText('This password reset link is invalid or has expired.')).toBeVisible()
  await page.screenshot({ path: 'test-results/password-reset-error.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'test-results/password-reset-error-phone.png', fullPage: true })
})

test('faction routes keep a stable content width', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  const widths: number[] = []
  for (const path of [
    '/factions',
    '/factions/necrons',
    '/factions/necrons/datasheets',
    '/factions/necrons/datasheets/lokhust-lord',
    '/factions/necrons/detachments/cryptek-conclave',
  ]) {
    await page.goto(path)
    widths.push((await page.locator('main').boundingBox())?.width ?? 0)
  }
  expect(new Set(widths).size).toBe(1)
  expect(widths[0]).toBeGreaterThan(0)
})

test('account libraries share their page width and fit a phone', async ({ page }) => {
  await signUp(page, 'MobilePlayer')
  await page.setViewportSize({ width: 1280, height: 800 })

  const widths: number[] = []
  for (const [path, heading] of [
    ['/rosters', 'My rosters'],
    ['/battles', 'My battles'],
    ['/friends', 'Friends'],
  ]) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: heading, exact: true, level: 1 })).toBeVisible()
    if (path === '/rosters') await expect(page.getByLabel('Loading roster count')).toHaveCount(0)
    widths.push((await page.locator('main').boundingBox())?.width ?? 0)
  }
  expect(new Set(widths).size).toBe(1)
  await page.goto('/rosters')
  await expect(page.getByRole('heading', { name: 'My rosters', exact: true })).toBeVisible()
  await expect(page.getByLabel('Loading roster count')).toHaveCount(0)
  const heroRail = await page.locator('main > header').first().locator('div.relative').last().boundingBox()
  const contentRail = await page.getByLabel('Roster filters').locator('..').boundingBox()
  expect(Math.abs((heroRail?.width ?? 0) - (contentRail?.width ?? 0))).toBeLessThan(4)
  await page.screenshot({ path: 'test-results/account-library-desktop.png', fullPage: true })
  const footer = await page.locator('footer').boundingBox()
  expect(footer ? Math.round(footer.y + footer.height) : 0).toBe(800)

  await page.setViewportSize({ width: 390, height: 844 })
  for (const path of ['/rosters', '/battles', '/friends', '/factions', '/missions']) {
    await page.goto(path)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  }
})

test('authentication panels and empty states fill the page above the footer', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/sign-in')
  const left = await page.locator('main > aside').boundingBox()
  const right = await page.locator('main > section').boundingBox()
  expect(left?.x).toBe(0)
  expect(right ? Math.round(right.x + right.width) : 0).toBe(1280)
  await page.goto('/friends')
  await expect(page.getByRole('heading', { name: 'Your friends' })).toBeVisible()
  const state = await page.locator('main > div').boundingBox()
  const footer = await page.locator('footer').boundingBox()
  expect(state && footer ? Math.round(state.y + state.height) : 0).toBe(Math.round(footer?.y ?? 0))
  expect(footer ? Math.round(footer.y + footer.height) : 0).toBe(800)
})

test('terrain layouts show source-backed areas and measurement guidance', async ({ page }) => {
  await page.goto('/missions/chapter-approved-2026-2027/matchups/purge-the-foe/take-and-hold')
  const dialog = page.getByRole('dialog')
  await expect(async () => {
    if (await dialog.isVisible()) return
    await page.getByRole('button', { name: 'Enlarge terrain layout A: Sweeping Engagement' }).click({ timeout: 1_000 })
    await expect(dialog).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 10_000 })
  const board = dialog.locator('svg[aria-label]').first()
  await expect(board).toBeVisible()
  expect(
    await board
      .locator('title')
      .filter({ hasText: /^Objective (terrain|marker)$/ })
      .count(),
  ).toBeGreaterThan(0)
  await page.screenshot({ path: 'test-results/terrain-layout-objectives.png' })
  await expect(dialog.getByText('60″ × 44″ board', { exact: false })).toBeVisible()
  await expect(dialog.getByText('Grid: 1″ · heavier line every 5″', { exact: false })).toBeVisible()
  await expect(
    board
      .locator('polygon')
      .filter({ has: page.locator('title') })
      .first(),
  ).toBeVisible()
  const distances = board.locator('line[marker-end]')
  await expect(distances).toHaveCount(42)
  await expect(board.locator('circle').filter({ has: page.locator('title', { hasText: /^Measurement endpoint$/ }) })).toHaveCount(26)
  await expect(board.locator('text').filter({ hasText: /^16⅜″$/ })).toHaveCount(2)
  await expect(dialog.getByText('For tilted terrain, match the two distances', { exact: false })).toBeVisible()
  await expect(dialog.getByText('Placement distance · nearest ⅛″', { exact: true })).toBeVisible()
  await expect(board.locator('text').filter({ hasText: /″$/ }).first()).toBeVisible()
  await expect(dialog.getByText('Approximate placement coordinates')).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.screenshot({ path: 'test-results/terrain-layout-tilt-phone.png' })
})

test('Tipping Point shows its off-terrain objectives as 40 mm markers', async ({ page }) => {
  await page.goto('/missions/chapter-approved-2026-2027/matchups/take-and-hold/reconnaissance')
  await page.getByRole('button', { name: 'Enlarge terrain layout A: Tipping Point' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('40 mm objective marker · outside terrain')).toBeVisible()
  await expect(dialog.locator('svg title').filter({ hasText: /^Objective marker outside terrain \(40 mm\)$/ })).toHaveCount(5)
  await expect(dialog.locator('svg title').filter({ hasText: /^Objective terrain$/ })).toHaveCount(0)
  await expect(dialog.locator('svg text').filter({ hasText: /^OBJECTIVE$/ })).toHaveCount(5)
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.screenshot({ path: 'test-results/tipping-point-objective-markers-phone.png' })
})

test('a mission opens while its terrain layouts load', async ({ page }) => {
  await page.goto('/missions/chapter-approved-2026-2027')

  let releaseTerrain: () => void = () => undefined
  const terrainHeld = new Promise<void>((resolve) => {
    releaseTerrain = resolve
  })
  let terrainStarted: () => void = () => undefined
  const started = new Promise<void>((resolve) => {
    terrainStarted = resolve
  })
  await page.route('**/_serverFn/**', async (route) => {
    const url = decodeURIComponent(route.request().url())
    if (url.includes('"matchupIds"') && url.includes('"geometryVersion"')) {
      terrainStarted()
      await terrainHeld
    }
    await route.continue()
  })

  const opening = page.locator('a[href*="/matchups/"]').first().click()
  await started
  try {
    await expect(page.getByText('Mission matchup', { exact: true })).toBeVisible({ timeout: 5_000 })
    await expect(page.getByRole('heading', { name: 'Loading terrain layouts' })).toBeVisible()
    await expect(page.getByText('Mission pack', { exact: true })).toHaveCount(0)
  } finally {
    releaseTerrain()
  }
  await opening
  await expect(page.getByRole('button', { name: /Enlarge terrain layout/ }).first()).toBeVisible()
})

test('terrain layout preserves structural corners and source distances', async ({ page }) => {
  await page.goto('/missions/chapter-approved-2026-2027/matchups/take-and-hold/priority-assets')
  const dialog = page.getByRole('dialog')
  await expect(async () => {
    if (await dialog.isVisible()) return
    await page.getByRole('button', { name: 'Enlarge terrain layout C: Dawn of War' }).click({ timeout: 1_000 })
    await expect(dialog).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 10_000 })
  const board = dialog.locator('svg[aria-label]').first()
  await expect(board.locator('polyline[stroke-linejoin="miter"]').first()).toBeAttached()
  await expect(board.locator('text').filter({ hasText: /^AB$/ }).first()).toBeVisible()
  await expect(board.locator('line[marker-end]')).toHaveCount(44)
  await expect(
    board
      .locator('text')
      .filter({ hasText: /^3″$/ })
      .first(),
  ).toBeVisible()
})

test('a matchup keeps each action in the column of the side whose mission asks for it', async ({ page }) => {
  // Priority Assets asks for the action here, and it is the side drawn second, so an
  // action packed into the first free column would read as the other side's.
  await page.goto('/missions/chapter-approved-2026-2027/matchups/take-and-hold/priority-assets')
  const panels = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: /^Actions/ }) })
    .locator('.bg-panel')
  await expect(panels.nth(0)).toContainText('Inescapable Dominion asks for no action.')
  await expect(panels.nth(1)).toContainText('SECURE ASSET')
})

test('a player can enter through the roster library and browse the product', async ({ page }) => {
  const reference = page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Reference', exact: true })
  // Signed out, the library is the builder a visitor can use without an account.
  await page.goto('/rosters')
  await expect(page.getByRole('heading', { name: 'Build a roster' })).toBeVisible()

  await signUp(page, 'Alice')
  await page.goto('/rosters')

  await expect(page.getByRole('heading', { name: 'My rosters' })).toBeVisible()
  const rendered = await page.request.get('/rosters')
  expect(await rendered.text()).toContain('My rosters')
  await expect(page.getByText('No rosters yet. Create one or bring one from another app.')).toBeVisible()
  await page.getByRole('button', { name: 'Filter' }).click()
  const filters = page.getByRole('dialog', { name: 'Filter rosters' })
  await filters.getByRole('combobox', { name: 'Battle size' }).click()
  await page.getByRole('option', { name: /Incursion/ }).click()
  await expect(page).toHaveURL('/rosters?limit=1000')
  await filters.getByRole('button', { name: 'Clear filters' }).click()
  await expect(page).toHaveURL('/rosters')
  await filters.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: /^Sort:/ }).click()
  await page.getByRole('menuitemradio', { name: 'A to Z' }).click()
  await expect(page.getByRole('button', { name: 'Sort: A to Z' })).toBeVisible()
  await expect(page).toHaveURL('/rosters')
  expect(await (await page.request.get('/rosters')).text()).toContain('aria-label="Sort: A to Z"')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Sort: A to Z' })).toBeVisible()
  await page.getByRole('button', { name: /^Sort:/ }).click()
  await page.getByRole('menuitemradio', { name: 'Recently updated', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Sort: Recently updated' })).toBeVisible()
  expect((await page.context().cookies()).some((cookie) => cookie.name === 'praetorium_roster_sort')).toBe(false)
  await page.screenshot({ path: 'test-results/roster-library.png', fullPage: true })
  await page.getByRole('button', { name: 'Create editable roster' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create roster' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('combobox', { name: 'Access' })).toContainText('Private — only you')
  await expect(dialog.getByLabel('Tags')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/create-roster-dialog.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'test-results/create-roster-dialog-phone.png', fullPage: true })
  await page.setViewportSize({ width: 1280, height: 720 })
  await expect(dialog.getByRole('button', { name: 'Create roster' })).toBeDisabled()
  await dialog.getByRole('combobox', { name: 'Faction' }).click()
  await page.getByPlaceholder('Search factions…').fill('Necr')
  await expect(page.getByRole('option', { name: 'Necrons', exact: true })).toBeVisible()
  await expect(page.getByRole('option', { name: 'Death Guard', exact: true })).toBeHidden()
  await page.screenshot({ path: 'test-results/faction-combobox.png', fullPage: true })
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 390, height: 844 })
  await dialog.getByRole('combobox', { name: 'Faction' }).click()
  await page.getByPlaceholder('Search factions…').fill('Necr')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.screenshot({ path: 'test-results/faction-combobox-phone.png', fullPage: true })
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.getByRole('option', { name: 'Necrons', exact: true }).click()
  await expect(dialog.getByRole('combobox', { name: 'Battle size' })).toContainText('Strike Force')
  await expect(dialog.getByText('0/3 DP used')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Create roster' })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Select Awakened Dynasty' }).click()
  await expect(dialog.getByText('3/3 DP used')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Take and Hold', exact: true })).toBeVisible()
  await page.setViewportSize({ width: 1600, height: 640 })
  await expect.poll(() => dialog.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
  // One scroll can land short of the end while the dialog is still laying out at the new height.
  await expect(async () => {
    await dialog.evaluate((element) => element.scrollTo({ top: element.scrollHeight }))
    await expect(dialog.getByRole('button', { name: 'Create roster' })).toBeInViewport({ timeout: 1_000 })
  }).toPass()
  await dialog.getByRole('combobox', { name: 'Battle size' }).click()
  await page.getByRole('option', { name: /Onslaught/ }).click()
  await dialog.getByRole('button', { name: 'Select Cryptek Conclave' }).click()
  await expect(dialog.getByRole('button', { name: 'Create roster' })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Priority Assets', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Create roster' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Remove Cryptek Conclave' }).click()
  await dialog.getByRole('combobox', { name: 'Battle size' }).click()
  await page.getByRole('option', { name: /Strike Force/ }).click()
  await dialog.getByRole('group', { name: 'Force disposition' }).getByRole('button', { name: 'Take and Hold' }).click()
  await dialog.getByRole('button', { name: 'Create roster' }).click()
  await expect(page).toHaveURL(/\/rosters\/[^/]+$/)
  await expect(page.getByRole('heading', { name: /Edit Necrons — Awakened Dynasty/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Necrons', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Awakened Dynasty', exact: true })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Faction' })).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: 'Battle size' })).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: 'Force' })).toHaveCount(0)
  await expect(page.getByText('Take and Hold', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Roster actions' }).click()
  await page.getByRole('menuitem', { name: 'Edit roster setup' }).click()
  const setup = page.getByRole('dialog', { name: 'Edit roster setup' })
  await setup.getByRole('combobox', { name: 'Battle size' }).click()
  await page.getByRole('option', { name: /Incursion/ }).click()
  await setup.getByRole('button', { name: 'Remove Awakened Dynasty' }).click()
  await setup.getByRole('button', { name: 'Select Cryptek Conclave' }).click()
  await setup.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Incursion', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Add a unit')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true)
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true)
  await page.screenshot({ path: 'test-results/roster-editor-phone.png' })
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.getByRole('button', { name: 'Roster actions' }).click()
  await page.getByRole('menuitem', { name: 'Edit roster setup' }).click()
  await setup.getByRole('button', { name: 'Remove Cryptek Conclave' }).click()
  await setup.getByRole('button', { name: 'Select Cursed Legion' }).click()
  await setup.getByRole('button', { name: 'Save changes' }).click()
  await page.getByLabel('Add a unit').fill('Lokhust Destroyers')
  await page.getByRole('button', { name: 'Add Lokhust Destroyers', exact: true }).first().click()
  await page
    .getByRole('button', { name: /^Lokhust Destroyers/ })
    .first()
    .click()
  const modifiedStrength = page.getByRole('button', {
    name: 'S 7, modified from 5 by Cursed Legion',
  })
  await expect(modifiedStrength).toBeVisible()
  await modifiedStrength.hover()
  await expect(page.getByRole('tooltip')).toContainText('5 → 7')
  await expect(page.getByRole('tooltip')).toContainText('Cursed Legion')
  await page.screenshot({ path: 'test-results/contextual-datasheet-modifier.png', fullPage: true })
  await page.getByLabel('Add a unit').fill('Skorpekh Lord')
  await page.getByRole('button', { name: 'Add Skorpekh Lord', exact: true }).first().click()
  await page.getByLabel('Add a unit').fill('Immortals')
  await page.getByRole('button', { name: 'Add Immortals', exact: true }).first().click()
  await page.locator('[data-unit="Immortals"]').getByRole('button', { name: 'Immortals', exact: true }).click()
  const immortalsWeapons = page.locator('aside[aria-label="Loadout"]')
  const gauss = immortalsWeapons.locator('article').filter({ hasText: 'Gauss blaster' }).first()
  await expect(gauss.getByText('5', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /modified from 5 by Cursed Legion/ })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/cursed-immortals-base-strength.png', fullPage: true })
  await page.getByRole('link', { name: 'Rosters', exact: true }).click()
  await page.getByRole('button', { name: 'Import roster' }).click()
  await expect(page.getByRole('dialog', { name: 'Import roster' })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('link', { name: 'Battles' }).click()
  await expect(page.getByRole('heading', { name: 'My battles' })).toBeVisible()
  await expect(page.getByText('No battles yet.')).toBeVisible()
  await page.getByRole('button', { name: 'New battle' }).click()
  await page.getByRole('combobox', { name: 'Opponent' }).click()
  await page.getByRole('option', { name: 'Practice Opponent', exact: true }).click()
  await page.getByRole('button', { name: 'Start battle' }).click()
  await expect(page).toHaveURL(/\/battles\/[^/?]+$/)
  await page.getByRole('link', { name: 'Battles' }).click()
  await expect(page.locator('[data-battle-shelf="Setup"]')).toBeVisible()
  await expect(page.getByText('Practice Opponent').first()).toBeVisible()
  await page.screenshot({ path: 'test-results/battle-library.png', fullPage: true })
  await page.locator('[data-battle-shelf="Setup"] article').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Delete battle' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete battle' }).click()
  await expect(page.getByText('No battles yet.')).toBeVisible()

  await reference.click()
  await page.getByRole('menuitem', { name: 'Factions' }).click()
  await expect(page.locator('[data-shelf="Chaos"]')).toBeVisible()
  await expect(page.locator('[data-shelf="Imperium"]')).toBeVisible()
  await expect(page.locator('[data-shelf="Xenos"]')).toBeVisible()
  await page.goto('/factions/dark-angels')
  const darkAngelsDatasheets = page.getByRole('link', { name: /Datasheets/ })
  await expect(darkAngelsDatasheets).toContainText('16')
  await expect(page.getByText('Detachments', { exact: true }).locator('..')).toContainText('3')
  await expect(page.getByText('Gladius Task Force', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/dark-angels-faction-content.png', fullPage: true })
  await darkAngelsDatasheets.click()
  await expect(page.locator('main > header [data-faction-mark="dark-angels"]')).toBeVisible()
  await expect(page.getByText('Epic heroes', { exact: true }).locator('..')).toContainText(/Epic heroes\s*\d+/)
  await expect(page.getByText('Infantry', { exact: true }).locator('..')).toContainText(/Infantry\s*\d+/)
  await expect(page.getByText('Vehicles', { exact: true }).locator('..')).toContainText(/Vehicles\s*\d+/)
  await expect(page.getByRole('link', { name: /Asmodai/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Intercessor Squad/ })).toHaveCount(0)
  await page.goto('/rosters')
  const darkAngelsSetup = page.getByRole('dialog', { name: 'Create roster' })
  await retryUntilVisible(darkAngelsSetup, () => page.getByRole('button', { name: 'Create editable roster' }).click())
  await darkAngelsSetup.getByRole('combobox', { name: 'Faction' }).click()
  await page.getByPlaceholder('Search factions…').fill('Dark Angels')
  await page.getByRole('option', { name: 'Dark Angels', exact: true }).click()
  await expect(darkAngelsSetup.getByRole('button', { name: 'Select Inner Circle Task Force' })).toBeVisible()
  await expect(darkAngelsSetup.getByRole('button', { name: 'Select Gladius Task Force' })).toBeVisible()
  await expect(darkAngelsSetup.getByRole('button', { name: 'Select Assault Brethren' })).toBeVisible()
  await darkAngelsSetup.getByRole('combobox', { name: 'Faction' }).click()
  await page.getByPlaceholder('Search factions…').fill('Blood Angels')
  await page.getByRole('option', { name: 'Blood Angels', exact: true }).click()
  await expect(darkAngelsSetup.getByRole('button', { name: 'Select Assault Brethren' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.goto('/factions')
  const necrons = page.locator('[data-shelf="Xenos"] [data-faction="Necrons"]')
  const favouriteSaved = page.waitForResponse(
    (response) =>
      response.ok() && response.request().method() === 'POST' && Boolean(response.request().postData()?.includes('catalogueId')),
  )
  await necrons.getByRole('button', { name: 'Add Necrons to favourites' }).click()
  await favouriteSaved
  await expect(page.locator('[data-shelf="Favourites"] [data-faction]').first()).toHaveAttribute('data-faction', 'Necrons')
  await expect(page.locator('[data-shelf="Xenos"] [data-faction]').first()).toHaveAttribute('data-faction', 'Aeldari')
  const serverRenderedFavourites = await (await page.request.get('/factions')).text()
  expect(serverRenderedFavourites).toMatch(/data-shelf="Favourites"[\s\S]+data-faction="Necrons"/)
  await page.screenshot({ path: 'test-results/faction-index.png', fullPage: true })
  await page.getByRole('link', { name: 'Rosters' }).click()
  await page.getByRole('button', { name: 'Create editable roster' }).click()
  await page.getByRole('dialog', { name: 'Create roster' }).getByRole('combobox', { name: 'Faction' }).click()
  const favourites = page.getByRole('group').filter({ has: page.getByText('Favourites', { exact: true }) })
  await expect(favourites.getByRole('option').first()).toHaveText('Necrons')
  await expect(page.getByRole('option').first()).toHaveText('Necrons')
  await expect(page.getByRole('option').first().locator('[data-faction-mark]')).toBeVisible()
  await page.getByRole('option').first().click()
  await expect(
    page.getByRole('dialog', { name: 'Create roster' }).getByRole('combobox', { name: 'Faction' }).locator('[data-faction-mark]'),
  ).toBeVisible()
  await page.getByRole('dialog', { name: 'Create roster' }).getByRole('combobox', { name: 'Faction' }).click()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await reference.click()
  await page.getByRole('menuitem', { name: 'Factions' }).click()
  await necrons.getByRole('link').click()
  await expect(page).toHaveURL('/factions/necrons')
  await expect(page.getByRole('link', { name: /Datasheets/ })).toBeVisible()
  const reanimationProtocols = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Reanimation Protocols' }) })
  await expect(reanimationProtocols).toContainText('Command phase')
  const cryptek = page.getByText('Cryptek Conclave').locator('../..')
  await expect(cryptek).toContainText('6 stratagems · 4 enhancements')
  await expect(cryptek).toContainText('2 DP')
  await expect(cryptek).toContainText('Priority Assets')
  const descriptionPages = await Promise.all(
    ['hand-of-the-dynasty', 'skyshroud-spearhead', 'the-phaerons-armoury'].map(async (detachment) =>
      (await page.request.get(`/factions/necrons/detachments/${detachment}`)).text(),
    ),
  )
  for (const contents of descriptionPages) expect(contents).not.toContain('Description unavailable')
  await page.screenshot({ path: 'test-results/faction-reference.png', fullPage: true })
  await page.goto('/factions/necrons/detachments/hand-of-the-dynasty')
  await page.waitForLoadState('networkidle')
  const rapidFire = page.getByRole('button', { name: '[RAPID FIRE 1]' })
  await rapidFire.hover()
  await expect(page.getByRole('tooltip')).toContainText('Rapid Fire')
  await page.getByRole('heading', { name: 'Hand of the Dynasty', exact: true }).hover()
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await page.getByRole('link', { name: 'Necrons' }).click()
  await page.getByRole('link', { name: /Cryptek Conclave/ }).click()
  await expect(page).toHaveURL('/factions/necrons/detachments/cryptek-conclave')
  await expect(page.locator('main [data-faction-mark="necrons"]')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Cryptek Conclave', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Technosorcerous Augmentations' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Enhancements/ })).toContainText('4')
  await expect(page.getByRole('heading', { name: 'Quantum Abacus' })).toBeVisible()
  const antiMonster = page.getByRole('button', { name: '[ANTI‑MONSTER 5+]' })
  await antiMonster.hover()
  await expect(page.getByRole('tooltip')).toContainText('Anti')
  await page.getByRole('heading', { name: 'Cryptek Conclave', exact: true }).hover()
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: /Stratagems/ })).toContainText('6')
  await expect(page.getByRole('heading', { name: 'Molecular Targeting' })).toBeVisible()
  await expect(
    page
      .getByRole('heading', { name: /Stratagems/ })
      .locator('..')
      .locator('article > div:last-child'),
  ).toHaveCount(6)
  await expect(page.getByText(/Catalogue data from BSData\/wh40k-11e/)).toBeVisible()
  await expect(page.getByText(/Data provided by game-datacards/)).toBeVisible()
  await expect(page.getByText(/Points from BSData Munitorum Field Manual \d+\.\d+/)).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Cryptek Conclave', exact: true })).toBeVisible()
  const detachmentResponse = await page.request.get('/factions/necrons/detachments/cryptek-conclave')
  expect(await detachmentResponse.text()).toContain('Technosorcerous Augmentations')
  await page.screenshot({ path: 'test-results/detachment.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'test-results/detachment-phone.png', fullPage: true })
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.getByRole('link', { name: 'Necrons' }).click()
  await page.getByRole('link', { name: /Datasheets/ }).click()
  await expect(page).toHaveURL(/\/datasheets$/)
  await expect(page.getByLabel('Find a datasheet')).toBeVisible()
  await page.getByLabel('Find a datasheet').fill('Overlord')
  await expect(page.getByRole('link', { name: /Overlord/ }).first()).toBeVisible()
  await expect(page.locator('main p.rubric').filter({ hasText: 'Datasheets' })).toContainText('2')
  await page.screenshot({ path: 'test-results/faction-datasheets.png', fullPage: true })
  await page
    .getByRole('link', { name: /Overlord/ })
    .first()
    .click()
  await expect(page).toHaveURL('/factions/necrons/datasheets/overlord')
  await expect(page.getByRole('heading', { name: 'Overlord', exact: true })).toBeVisible()
  await expect(page.getByText('90 pts').first()).toBeVisible()
  await expect(page.getByRole('heading', { name: /Ranged weapons/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Melee weapons/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Faction abilities/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Datasheet abilities/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reanimation Protocols' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'My Will Be Done' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Wargear abilities/ })).toBeVisible()
  await expect(page.getByText('1 model', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Unit configuration' })).toBeVisible()
  await expect(page.getByText('1 Overlord', { exact: true })).toBeVisible()
  await expect(page.getByText(/This model is equipped with:/)).toBeVisible()
  await expect(page.getByRole('heading', { name: /Wargear options/ })).toBeVisible()
  await expect(page.getByText(/resurrection orb/).last()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Attachments' })).toBeVisible()
  await expect(page.getByText('Can lead', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Detachments/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Devastating Wounds' }).first().hover()
  await expect(page.getByRole('tooltip').getByText('Devastating Wounds', { exact: true })).toBeVisible()
  await expect(page.getByRole('tooltip')).toContainText('critical wound')
  await page.screenshot({ path: 'test-results/keyword-tooltip.png', fullPage: true })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Overlord', exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/datasheet.png', fullPage: true })
  await page.goto('/factions/necrons/datasheets/ghost-ark')
  await expect(page.getByRole('heading', { name: 'Transport' })).toBeVisible()
  await expect(page.getByText(/transport capacity of 10/)).toBeVisible()
  await page.screenshot({ path: 'test-results/transport-datasheet.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'test-results/transport-datasheet-phone.png', fullPage: true })
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/factions/necrons/datasheets/overlord-with-translocation-shroud')
  await expect(page.getByRole('heading', { name: 'Overlord with Translocation Shroud', exact: true })).toBeVisible()
  await expect(page.getByText('Invulnerable save', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Translocation Shroud', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Resurrection Orb' })).toBeVisible()
  await page.screenshot({ path: 'test-results/translocation-shroud.png', fullPage: true })
})

test('the first sort choice orders saved rosters and persists on mobile', async ({ page }) => {
  await signUp(page, 'Roster sorter')
  await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Zulu roster' })
  await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/, name: 'Alpha roster' })
  await page.goto('/rosters')

  const rows = page.locator('[data-roster]')
  await expect(rows.first()).toHaveAttribute('data-roster', 'Alpha roster')
  await page.getByRole('button', { name: /^Sort:/ }).click()
  await page.getByRole('menuitemradio', { name: 'Z to A' }).click()
  await expect(rows.first()).toHaveAttribute('data-roster', 'Zulu roster')
  await expect(page.getByRole('button', { name: 'Sort: Z to A' })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: /^Sort:/ }).click()
  await page.getByRole('menuitemradio', { name: 'A to Z' }).click()
  await expect(rows.first()).toHaveAttribute('data-roster', 'Alpha roster')
  await page.reload()
  await expect(rows.first()).toHaveAttribute('data-roster', 'Alpha roster')
  expect(await (await page.request.get('/rosters')).text()).toContain('aria-label="Sort: A to Z"')
})

test('a guest roster stays within the native mobile builder viewport', async ({ page, context }) => {
  await context.addInitScript({ content: `window.ReactNativeWebView = { postMessage: () => {} };\n${NATIVE_BROWSER_BRIDGE_SCRIPT}` })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/rosters')
  const search = page.getByPlaceholder('Search factions…')
  await retryUntilVisible(search, () => page.getByRole('combobox', { name: 'Faction' }).click())
  await search.fill('Necrons')
  await page.getByRole('option', { name: 'Necrons', exact: true }).click()
  await page.getByRole('button', { name: 'Select Awakened Dynasty' }).click()
  await page.getByRole('group', { name: 'Force disposition' }).getByRole('button', { name: 'Take and Hold' }).click()
  await page.getByRole('button', { name: 'Start building' }).click()

  const content = page.locator('[data-native-app-content]')
  await expect(content).toHaveAttribute('data-immersive', 'true')
  await expect(page.locator('[data-roster-builder]')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true)
  await page.screenshot({ path: 'test-results/guest-roster-mobile-native.png' })
  await page.mouse.wheel(0, 1000)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  await page.setViewportSize({ width: 390, height: 568 })
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true)
  await page.reload()
  await expect(content).toHaveAttribute('data-immersive', 'true')
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true)
})

test('a dense squad datasheet remains readable at desktop and phone widths', async ({ page }) => {
  await page.goto('/factions/dark-angels/datasheets/deathwing-terminator-squad')
  await expect(page.getByRole('heading', { name: 'Deathwing Terminator Squad', exact: true })).toBeVisible()
  await expect(page.getByText('5–10 models', { exact: true })).toBeVisible()
  await expect(page.getByText('Models', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Invulnerable save', { exact: true })).toBeVisible()
  await expect(page.getByText('4+', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Ranged weapons 5', exact: true })).toBeVisible()
  const missiles = page.getByRole('rowgroup', { name: 'cyclone missile launcher profiles' })
  await expect(missiles.getByRole('rowheader', { name: 'Frag', exact: true })).toBeVisible()
  await expect(missiles.getByRole('rowheader', { name: 'Krak', exact: true })).toBeVisible()
  const plasma = page.getByRole('rowgroup', { name: 'plasma cannon profiles' })
  await expect(plasma.getByRole('rowheader', { name: 'Standard', exact: true })).toBeVisible()
  await expect(plasma.getByRole('rowheader', { name: 'Supercharge', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Melee weapons 3', exact: true })).toBeVisible()
  await expect(page.getByText('Captain in Terminator Armour', { exact: true })).toBeVisible()
  await expect(page.getByText(/^Ancient in Terminator Armou?r$/)).toBeVisible()
  await expect(page.getByText(/Legends/)).toHaveCount(0)
  await page.screenshot({ path: 'test-results/deathwing-terminator-datasheet.png', fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'test-results/deathwing-terminator-datasheet-phone.png', fullPage: true })
})

test('weapon profile modes use readable casing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/factions/necrons/datasheets/ctan-shard-of-the-void-dragon')
  const spear = page.getByRole('rowgroup', { name: 'spear of the void dragon profiles' })
  await expect(spear.getByRole('rowheader', { name: 'Strike', exact: true })).toBeVisible()
  await expect(spear.getByRole('rowheader', { name: 'Sweep', exact: true })).toBeVisible()
  await page.getByRole('heading', { name: 'Melee weapons 2', exact: true }).locator('..').screenshot({
    path: 'test-results/void-dragon-weapon-profiles.png',
  })
})

test('an officer datasheet shows how many orders it can issue', async ({ page }) => {
  await page.goto('/factions/astra-militarum/datasheets/leman-russ-commander')
  const orders = page.getByRole('heading', { name: 'Orders', exact: true }).locator('..')
  await expect(orders).toContainText('This Officer can issue 2 Orders to Squadron units.')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(await page.evaluate(() => window.innerWidth))
  await page.screenshot({ path: 'test-results/officer-orders-datasheet.png', fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.screenshot({ path: 'test-results/officer-orders-datasheet-phone.png', fullPage: true })
})

test('each application tab returns to where it was left', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  const sections = page.getByRole('navigation', { name: 'Application sections' })

  await page.goto('/factions/dark-angels/datasheets/deathwing-terminator-squad')
  const viewportHeight = await page.evaluate(() => window.innerHeight)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(viewportHeight)
  await expect
    .poll(() =>
      page.evaluate(() => {
        window.scrollTo(0, 600)
        return window.scrollY
      }),
    )
    .toBeGreaterThan(0)
  const factionScroll = await page.evaluate(() => window.scrollY)
  // The missions tab lands on the current pack, so its memory is that redirect.
  await sections.getByRole('link', { name: 'Missions' }).click()
  await expect(page).toHaveURL(/\/missions\//)

  await sections.getByRole('link', { name: 'Factions' }).click()
  await expect(page).toHaveURL('/factions/dark-angels/datasheets/deathwing-terminator-squad')
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(factionScroll)

  // The section you are already in has one obvious destination left: its top.
  await sections.getByRole('link', { name: 'Factions' }).click()
  await expect(page).toHaveURL('/factions')

  await sections.getByRole('link', { name: 'Missions' }).click()
  await sections.getByRole('link', { name: 'Factions' }).click()
  await expect(page).toHaveURL('/factions')

  await context.close()
})

test.describe('data update anchors', () => {
  // The rows only exist for a catalogue that carries a history; the release pin may predate it.
  test.skip(!fs.existsSync(join(catalogue, 'changes', 'history.json')), 'the catalogue under test carries no data-update history')

  /** A row that starts closed, and a faction link inside its summary. */
  async function closedRow(page: Page) {
    await page.goto('/data-updates')
    const closed = page.locator('main details:not([open])').first()
    await expect(closed).toBeAttached()
    const id = await closed.getAttribute('id')
    if (!id) throw new Error('Data update row is missing its anchor')
    const row = page.locator(`#${id}`)
    return { row, chip: row.locator('summary a').first() }
  }

  const belowHeader = async (page: Page, id: string) => {
    const top = await page.evaluate((target) => document.getElementById(target)?.getBoundingClientRect().top ?? -1, id)
    const header = await page.evaluate(() => document.querySelector('header')?.getBoundingClientRect().bottom ?? 0)
    return top >= header && top < (page.viewportSize()?.height ?? 0)
  }

  test('a faction link opens its update and lands on that faction', async ({ page }) => {
    const { row, chip } = await closedRow(page)
    const target = (await chip.getAttribute('href'))!.slice(1)

    await chip.click()

    await expect(row).toHaveAttribute('open', '')
    await expect(page).toHaveURL(new RegExp(`#${target}$`))
    await expect.poll(() => belowHeader(page, target)).toBe(true)
  })

  test('a faction link in an open update leaves it open', async ({ page }) => {
    await page.goto('/data-updates')
    const open = page.locator('main details[open]').first()
    const id = await open.getAttribute('id')
    if (!id) throw new Error('Data update row is missing its anchor')
    const row = page.locator(`#${id}`)
    await row.locator('summary a').first().click()

    await expect(row).toHaveAttribute('open', '')
  })

  test("a faction's page lists only that faction's changes", async ({ page }) => {
    await page.goto('/data-updates')
    const heading = page.locator('main [data-faction] h3 a').first()
    const faction = await heading.textContent()
    const slug = (await heading.getAttribute('href'))!.split('/').at(-1)!
    await page.goto(`/factions/${slug}`)

    await page.locator('main').getByRole('link', { name: 'Data updates' }).click()

    await expect(page).toHaveURL(`/data-updates/${slug}`)
    await expect(page.locator('main [data-faction]').first()).toBeVisible()
    expect(
      new Set(await page.locator('main [data-faction]').evaluateAll((blocks) => blocks.map((block) => block.getAttribute('data-faction')))),
    ).toEqual(new Set([faction]))
  })

  test('an address naming an update opens it', async ({ page }) => {
    const { row } = await closedRow(page)
    const id = (await row.getAttribute('id'))!

    await page.goto(`/data-updates#${id}`)

    await expect(page.locator(`[id="${id}"]`)).toHaveAttribute('open', '')
    await expect.poll(() => belowHeader(page, id)).toBe(true)
  })
})
