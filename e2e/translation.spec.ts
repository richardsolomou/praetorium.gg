import { expect, test, type Page } from './test'
import { chooseUnit, retryUntilVisible, signUp, uniqueName, visitorSetup } from './account'

async function replaceTranslatedText(page: Page) {
  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []
    while (walker.nextNode()) {
      const node = walker.currentNode as Text
      if (node.textContent?.trim() && !node.parentElement?.closest('script,style,svg,textarea,input,font')) nodes.push(node)
    }
    for (const node of nodes) {
      const replacement = document.createElementNS('http://www.w3.org/1999/xhtml', 'font')
      replacement.setAttribute('data-translated', '')
      replacement.textContent = node.textContent
      node.parentNode!.replaceChild(replacement, node)
    }
  })
}

for (const width of [1440, 390])
  test(`a translated guest roster setup can select its first faction at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const setup = await visitorSetup(page)
    const faction = setup.getByRole('combobox', { name: 'Faction', exact: true })
    await expect(faction).toBeEnabled()
    await replaceTranslatedText(page)
    await faction.click()
    await page.getByRole('option', { name: 'Necrons', exact: true }).click()
    await expect(setup).toBeVisible()
    await expect(faction).toContainText('Necrons')
    await page.screenshot({ path: test.info().outputPath(`translated-guest-roster-${width}.png`), fullPage: true })
  })

test('a translated signed-in roster dialog keeps working through creation', async ({ page }) => {
  await signUp(page, uniqueName('Translated setup'))
  await page.goto('/rosters')
  const dialog = page.getByRole('dialog', { name: 'Create roster', exact: true })
  await retryUntilVisible(dialog, () => page.getByRole('button', { name: 'New roster', exact: true }).click())
  await replaceTranslatedText(page)
  const faction = dialog.getByRole('combobox', { name: 'Faction', exact: true })
  await faction.click()
  await page.getByRole('option', { name: 'Necrons', exact: true }).click()
  await expect(faction).toContainText('Necrons')
  await dialog.getByLabel('Roster name', { exact: true }).fill('Translated army')
  await dialog.getByRole('button', { name: 'Select Awakened Dynasty', exact: true }).click()
  await dialog.getByRole('group', { name: 'Force disposition' }).getByRole('button', { name: 'Take and Hold', exact: true }).click()
  await dialog.getByRole('button', { name: 'Create roster', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'List name', exact: true })).toHaveValue('Translated army')
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'List name', exact: true })).toHaveValue('Translated army')
  await page.screenshot({ path: test.info().outputPath('translated-saved-roster.png'), fullPage: true })
})

test('a translated virtualized unit selector opens a reference unit in the simulator', async ({ page }) => {
  await page.goto('/simulator')
  const unit = page.getByRole('combobox', { name: 'Attacker unit', exact: true })
  await expect(unit).toHaveAttribute('aria-busy', 'false')
  await replaceTranslatedText(page)
  await chooseUnit(page, 'Attacker', 'Necrons', 'Imotekh the Stormlord')
  await expect(unit).toContainText('Imotekh the Stormlord')
  await page.reload()
  await expect(unit).toContainText('Imotekh the Stormlord')
})
