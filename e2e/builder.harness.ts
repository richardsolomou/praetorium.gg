import { expect, type Locator, type Page } from '@playwright/test'
import { createRoster, signUp } from './account'

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

/**
 * The four things a player coming from another builder reaches for: squad size where
 * the roster is, the filters that narrow a book down to today's real options, and
 * characters standing with the units they lead.
 */
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

export async function attach(page: Page, unit: string, target: string) {
  await page
    .locator(`[data-unit="${unit}"]`)
    .first()
    .getByRole('button', { name: `Attach ${unit} to unit` })
    .click()
  await page.getByRole('menu').getByRole('menuitem', { name: target, exact: true }).click()
}
