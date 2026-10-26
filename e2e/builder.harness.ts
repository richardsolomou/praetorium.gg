import { expect, type Locator, type Page } from '@playwright/test'
import { createRoster, signUp } from './account'
import { baseURL } from './stackEnv'

/**
 * A picture of one element, taken again if the page moved under it.
 *
 * A panel re-renders as its deferred pricing arrives, which replaces the node a
 * locator resolved to a moment before — so on a cold first run the element a passing
 * assertion just read could be gone by the time it is photographed.
 */
export async function shot(element: Locator, path: string) {
  await expect(async () => {
    await element.screenshot({ path })
  }).toPass({ timeout: 10_000 })
}

export async function expectNoHorizontalOverflow(element: Locator) {
  const width = await element.evaluate((node) => ({ client: node.clientWidth, scroll: node.scrollWidth }))
  expect(width.scroll).toBe(width.client)
}

export async function expectInsideHorizontalBounds(container: Locator, elements: Locator) {
  const boundary = await container.boundingBox()
  expect(boundary).not.toBeNull()
  for (const element of await elements.all()) {
    const box = await element.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(boundary!.x)
    expect(box!.x + box!.width).toBeLessThanOrEqual(boundary!.x + boundary!.width)
  }
}

/** Which ends of a scroller are masked, read from the gradient the header paints over it. */
export async function fadedEdges(element: Locator) {
  const mask = await element.evaluate((node) => getComputedStyle(node).maskImage)
  return { start: mask.includes('to right, rgba(0, 0, 0, 0)'), end: mask.endsWith('rgba(0, 0, 0, 0) 100%)') }
}

export async function expectVerticalPanOnly(element: Locator) {
  const style = await element.evaluate((node) => {
    const computed = getComputedStyle(node)
    return { overflowX: computed.overflowX, overscrollX: computed.overscrollBehaviorX, touchAction: computed.touchAction }
  })
  expect(style).toEqual({ overflowX: 'hidden', overscrollX: 'none', touchAction: 'pan-y' })
}

/** Signs up and opens a new roster in the builder. */
export async function openBuilder(page: Page, faction = 'Necrons', detachment = /Awakened Dynasty/) {
  await signUp(page, 'Richard')
  await createRoster(page, { faction, detachment })
}

export async function add(page: Page, name: string) {
  await page.getByLabel('Add a unit').fill(name)
  await page
    .getByRole('button', { name: `Add ${name}`, exact: true })
    .first()
    .click()
}

/** Closes the unit picker where it opens as a dialog over the roster. */
export async function closePicker(page: Page) {
  const picker = page.getByRole('dialog', { name: 'Add units' })
  if (await picker.isVisible()) await picker.getByRole('button', { name: 'Close', exact: true }).click()
}

/** An absent item proves nothing until the menu has opened, and an Escape pressed before then leaves it open over the roster. */
export async function expectNotAttachable(card: Locator, unit: string, target: string) {
  const menu = card.page().getByRole('menu')
  await card.getByRole('button', { name: `Attach ${unit} to unit` }).click()
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: target, exact: true })).toHaveCount(0)
  await card.page().keyboard.press('Escape')
  await expect(menu).toBeHidden()
}

export async function attach(page: Page, unit: string, target: string) {
  const card = page.locator(`[data-unit="${unit}"]`).first()
  await card.getByRole('button', { name: `Attach ${unit} to unit` }).click()
  await page.getByRole('menu').getByRole('menuitem', { name: target, exact: true }).click()
  // By role the card names the unit it joined; attached together it shares that unit's outline instead.
  const outlined = page
    .locator('section[aria-label]')
    .filter({ has: card })
    .filter({ has: page.locator(`[data-unit="${target}"]`) })
  await expect(card.filter({ hasText: target }).or(outlined).first()).toBeVisible()
}

/** Shows each datasheet on its role shelf, where its card names the unit it joined, for tests about those rows. */
export const arrangeByRole = (page: Page) =>
  page.context().addCookies([{ name: 'praetorium_roster_arrangement', value: 'role', url: `${baseURL}/rosters` }])
