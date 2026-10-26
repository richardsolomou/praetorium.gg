import { expect, test, type Page } from './test'
import { createRoster, setupStep, signUp, startBattle, expectNoPageOverflow, practiceBattle, chooseOption, PHONE } from './account'
import { chooseCombatUnit, openCombatBreakdown } from './combat'
import { expectNoHorizontalOverflow } from './builder.harness'

// Controls transition their font size, so measuring before the transitions finish reads the old layout.
async function doubleText(page: Page) {
  await page.addStyleTag({ content: 'html { font-size: 200% }' })
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => !(animation instanceof CSSTransition) || animation.playState !== 'running'),
  )
}

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
  await chooseOption(page, 'Opponent', 'Practice Opponent')
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

test('keeps the header controls on screen at double text size', async ({ page }) => {
  await page.goto('/battles')
  await page.waitForLoadState('networkidle')
  await doubleText(page)
  const header = page.locator('header[data-web-app-chrome]')
  const outside = await header.evaluate((element) =>
    ['nav[aria-label="Primary"]', '[aria-label="Search Praetorium"]', '[aria-label="Account menu"]'].some((selector) => {
      const bounds = element.querySelector(selector)!.getBoundingClientRect()
      return bounds.width === 0 || bounds.right > innerWidth
    }),
  )
  expect(outside).toBe(false)
  await page.getByRole('button', { name: 'Reference' }).click()
  await page.getByRole('menuitem', { name: 'Missions' }).click()
  await expect(page).toHaveURL(/\/missions/)
})

test.describe('a touch device', () => {
  test.use({ hasTouch: true, viewport: PHONE })

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

  test('keeps unit picker rows, loadout controls and application tabs inside their bounds at double text size', async ({ page }) => {
    await signUp(page, 'Large text')
    await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/ })
    await doubleText(page)
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

    await page
      .locator('[data-unit="Immortals"]')
      .getByRole('button', { name: /^Immortals/ })
      .click()
    const more = page.getByRole('button', { name: 'More models in Immortals', exact: true })
    expect(await more.evaluate((button) => button.getBoundingClientRect().right <= innerWidth)).toBe(true)
    await more.click()
    await expect(page.getByLabel('Immortals models')).toHaveText('6')
  })

  test('keeps reserve counts, the battle scoreboard and phase control readable at double text size', async ({ page }) => {
    await signUp(page, 'Large text battle')
    const roster = await createRoster(page, { faction: 'Necrons', detachment: /Awakened Dynasty/ })
    await practiceBattle(page, roster)
    await doubleText(page)
    await setupStep(page, 'Reserves')
    const reserves = page.getByRole('region', { name: 'Reserves', exact: true })
    await expect(reserves).toContainText('reserve points')
    const outside = await reserves.evaluate((section) => {
      const bounds = section.getBoundingClientRect()
      return [...section.querySelectorAll('.chip')].some((chip) => chip.getBoundingClientRect().right > bounds.right + 1)
    })
    expect(outside).toBe(false)
    await startBattle(page)
    const end = page.getByRole('button', { name: 'End the command phase' })
    await expect(end).toBeVisible()
    const unreadable = await page.locator('[data-scoreboard]').evaluate((board) => {
      const title = board.querySelector('h1')!.getBoundingClientRect()
      const covered = [...board.querySelectorAll('.figure')].some((figure) => {
        const bounds = figure.getBoundingClientRect()
        return bounds.left < title.right && title.left < bounds.right && bounds.top < title.bottom && title.top < bounds.bottom
      })
      const button = [...document.querySelectorAll('[data-turn-control] button')].find(
        (candidate) => candidate.textContent === 'End the command phase',
      )!
      return { covered, clipped: button.scrollWidth > button.clientWidth }
    })
    expect(unreadable).toEqual({ covered: false, clipped: false })
  })

  test('keeps simulator units, weapon headings and result figures apart at double text size', async ({ page }) => {
    await page.goto('/simulator')
    await page.waitForLoadState('networkidle')
    await doubleText(page)
    await chooseCombatUnit(page, 'Attacker', 'Necrons', 'Immortals')
    const labels = page.locator('p.eyebrow', { hasText: /^Range$/ }).filter({ visible: true })
    await expect(labels.first()).toBeVisible()
    const headingsOverlap = await labels.evaluateAll((ranges) =>
      ranges.some((range) => {
        const cells = [...range.parentElement!.parentElement!.children].map((cell) => {
          const text = document.createRange()
          text.selectNodeContents(cell.querySelector('p')!)
          return text.getBoundingClientRect()
        })
        return cells.some((cell, at) => {
          const next = cells[at + 1]
          return next !== undefined && cell.right > next.left && cell.top < next.bottom && next.top < cell.bottom
        })
      }),
    )
    expect(headingsOverlap).toBe(false)
    await chooseCombatUnit(page, 'Defender', 'Space Marines', 'Intercessor Squad')
    await page.screenshot({ path: test.info().outputPath('simulator-large-text-controls.png') })
    await expect.poll(() => new URL(page.url()).searchParams.get('s')).not.toBeNull()
    const summary = page.locator('[data-results-summary]')
    await expect(summary.locator('[data-combat-wipe]').first()).toContainText('%')
    await openCombatBreakdown(page)
    const figuresOverlap = await summary.evaluate((element) =>
      [...element.querySelectorAll('[data-result-numbers]')].some((row) => {
        const figures = [...row.children].map((child) => {
          const text = document.createRange()
          text.selectNodeContents(child)
          return text.getBoundingClientRect()
        })
        return figures.some((figure, at) =>
          figures
            .slice(at + 1)
            .some(
              (other) => figure.left < other.right && other.left < figure.right && figure.top < other.bottom && other.top < figure.bottom,
            ),
        )
      }),
    )
    expect(figuresOverlap).toBe(false)
  })

  test('keeps the account menu on screen at double text size', async ({ page }) => {
    await page.goto('/battles')
    await page.waitForLoadState('networkidle')
    await doubleText(page)
    await page.locator('[data-mobile-app-header]').getByRole('button', { name: 'Account menu' }).click()
    const menu = page.getByRole('menu')
    await expect(menu.getByRole('menuitem', { name: 'Sign in' })).toBeVisible()
    const outside = await menu.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      return bounds.left < 0 || bounds.right > innerWidth
    })
    expect(outside).toBe(false)
  })

  test('wraps page tabs inside the screen at double text size', async ({ page }) => {
    await signUp(page, 'Tabs')
    await page.locator('[data-mobile-app-header]').getByRole('button', { name: 'Account menu for Tabs' }).click()
    await page.getByRole('menuitem', { name: 'My profile' }).click()
    await expect(page.getByRole('tab', { name: 'Collection' })).toBeVisible()
    await doubleText(page)
    await expectNoPageOverflow(page)

    await page.goto('/rosters')
    const views = page.getByRole('navigation', { name: 'Rosters' })
    await expect(views).toBeVisible()
    await doubleText(page)
    await expectNoHorizontalOverflow(views)
  })
})
