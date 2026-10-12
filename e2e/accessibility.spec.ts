import { expect, test } from '@playwright/test'
import { attachRoster, createBattle, createRoster, PRACTICE_OPPONENT, setupStep, signUp } from './account'
import { chooseCombatUnit } from './combat'

test('opening a battle is operable from the keyboard', async ({ page }) => {
  await signUp(page, 'Alice')
  await page.goto('/battles')
  const initialResponse = await page.request.get('/battles')
  const initialDocument = await initialResponse.text()
  expect(initialDocument).not.toContain('Practice Opponent')
  expect(initialDocument).not.toContain('favourite-factions')
  expect(initialDocument).not.toContain('favourite-detachments')
  await page.reload()

  // Enough tabs to cross the header: the logo, every primary navigation link,
  // search and the account menu all come before the page's own first control.
  for (let tabs = 0; tabs < 20; tabs++) {
    if (await page.getByRole('button', { name: 'New battle' }).evaluate((element) => element === document.activeElement)) break
    await page.keyboard.press('Tab')
  }
  const newBattle = page.getByRole('button', { name: 'New battle' })
  await expect(newBattle).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Start a battle' })).toBeVisible()
  await page.getByRole('combobox', { name: 'Opponent' }).click()
  await page.getByRole('option', { name: 'Practice Opponent', exact: true }).click()
  await page.screenshot({ path: 'test-results/new-battle-dialog.png', fullPage: true })
  await page.getByRole('button', { name: 'Start battle' }).click()
  await expect(page).toHaveURL(/\/battles\/[^/]+$/)
})

test('reduced motion removes meaningful transitions', async ({ page }) => {
  await signUp(page, 'Alice')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/battles')

  const duration = await page
    .getByRole('button', { name: 'New battle' })
    .evaluate((element) => getComputedStyle(element).transitionDuration)
  expect(Number.parseFloat(duration)).toBeLessThanOrEqual(0.00001)
})

test('rendered controls do not reuse ids', async ({ page }) => {
  await page.goto('/')
  const duplicates = await page.locator('[id]').evaluateAll((elements) => {
    const ids = elements.map((element) => element.id)
    return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))]
  })
  expect(duplicates).toEqual([])
})

test.describe('a touch device', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } })

  // Below 16px iOS zooms the page when the field takes focus, and the zoom carries
  // the fixed application header and tabs off the screen.
  test('renders no text field small enough to zoom the page', async ({ page }) => {
    await page.goto('/sign-in')
    await page.getByRole('button', { name: 'Search Praetorium' }).click()
    await expect(page.getByPlaceholder('Search everything')).toBeVisible()

    const sizes = await page
      .locator('input:not([type="checkbox"]):not([type="radio"]), textarea')
      .evaluateAll((fields) =>
        fields.filter((field) => field.checkVisibility()).map((field) => Number.parseFloat(getComputedStyle(field).fontSize)),
      )

    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(16)
  })

  test('keeps unit picker rows and application tabs inside their bounds at double text size', async ({ page }) => {
    await signUp(page, 'Large text')
    await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/ })
    await page.addStyleTag({ content: 'html { font-size: 200% }' })
    await page.getByLabel('Add a unit').fill('Immortals')
    const row = page.locator('[data-picker-unit="Immortals"]')
    const overlaps = await row.evaluate((element) => {
      const bounds = (selector: string) => element.querySelector(selector)!.getBoundingClientRect()
      const edge = element.getBoundingClientRect().right
      const name = element.querySelector('button span span')!.getBoundingClientRect()
      const actions = [bounds('[aria-label^="Add Immortals to"]'), bounds('.chip'), bounds('[data-onboarding="picker-add"]')]
      return actions.some(
        (action) =>
          action.right > edge + 1 ||
          (action.left < name.right && name.left < action.right && action.top < name.bottom && name.top < action.bottom),
      )
    })
    expect(overlaps).toBe(false)
    await page.screenshot({ path: test.info().outputPath('picker-double-text.png') })
    await page.getByRole('button', { name: 'Add Immortals', exact: true }).click()
    await expect(page.locator('[data-unit="Immortals"]')).toHaveCount(1)

    await page.keyboard.press('Escape')
    const tabs = page.getByRole('navigation', { name: 'Application sections' })
    await expect(tabs).toBeVisible()
    const clipped = await tabs.getByRole('link').evaluateAll((links) =>
      links.some((link) => {
        const label = link.querySelector('span')!.getBoundingClientRect()
        const bounds = link.getBoundingClientRect()
        return label.left < bounds.left - 1 || label.right > bounds.right + 1
      }),
    )
    expect(clipped).toBe(false)
    await tabs.screenshot({ path: test.info().outputPath('tabs-double-text.png') })
  })

  test('keeps battle reserve counts inside their section at double text size', async ({ page }) => {
    await signUp(page, 'Large text reserves')
    const roster = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/ })
    await createBattle(page, { practice: true })
    await attachRoster(page, roster)
    await attachRoster(page, roster, { forPlayer: PRACTICE_OPPONENT })
    await page.addStyleTag({ content: 'html { font-size: 200% }' })
    await setupStep(page, 'Reserves')
    const reserves = page.getByRole('region', { name: 'Reserves', exact: true })
    await expect(reserves).toContainText('reserve points')
    const outside = await reserves.evaluate((section) => {
      const bounds = section.getBoundingClientRect()
      return [...section.querySelectorAll('.chip')].some((chip) => chip.getBoundingClientRect().right > bounds.right + 1)
    })
    expect(outside).toBe(false)
    await reserves.screenshot({ path: test.info().outputPath('reserves-double-text.png') })
  })

  test('keeps the loadout model count controls on screen at double text size', async ({ page }) => {
    await signUp(page, 'Large text loadout')
    await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/ })
    await page.getByLabel('Add a unit').fill('Immortals')
    await page.getByRole('button', { name: 'Add Immortals', exact: true }).click()
    await page.keyboard.press('Escape')
    await page.addStyleTag({ content: 'html { font-size: 200% }' })
    await page
      .locator('[data-unit="Immortals"]')
      .getByRole('button', { name: /^Immortals/ })
      .click()
    const more = page.getByRole('button', { name: 'More models in Immortals', exact: true })
    expect(await more.evaluate((button) => button.getBoundingClientRect().right <= innerWidth)).toBe(true)
    await more.click()
    await expect(page.getByLabel('Immortals models')).toHaveText('6')
    await page.screenshot({ path: test.info().outputPath('loadout-double-text.png') })
  })

  test('chooses simulator units at double text size', async ({ page }) => {
    await page.goto('/simulator')
    await page.waitForLoadState('networkidle')
    await page.addStyleTag({ content: 'html { font-size: 200% }' })
    await chooseCombatUnit(page, 'Attacker', 'Necrons', 'Immortals')
    await chooseCombatUnit(page, 'Defender', 'Space Marines', 'Intercessor Squad')
    await expect.poll(() => new URL(page.url()).searchParams.get('s')).not.toBeNull()
    await page.screenshot({ path: test.info().outputPath('simulator-double-text.png') })
  })
})
