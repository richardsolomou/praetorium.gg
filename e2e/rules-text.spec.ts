import { expect, test } from './test'

// Praetorium shows VS Data summaries, never a source's wording, and a browser never loads the wording either.
const rulesPage = '/rules/core-rules/moving'
const prose = 'The principles of movement are explained here.'
// Abilities VS Data does not summarize, which Game Datacards prints.
const unsummarizedPage = '/factions/adeptus-mechanicus/datasheets/tech-priest-enginseer'
const unsummarized = 'unless it is leading a unit, this model has the Lone Operative ability'

test('a rules page shows a summary of every rule and never its wording', async ({ page }) => {
  const response = await page.goto(rulesPage)
  expect(await response?.text()).not.toContain(prose)
  const rules = page.getByRole('main').getByRole('article')
  await expect(rules.first()).toBeVisible()
  await expect(page.getByRole('main').locator('[data-rule-summary]')).toHaveCount(await rules.count())
  await expect(page.getByText(prose)).toHaveCount(0)
})

test('a rule without a summary shows its name and no placeholder', async ({ page }) => {
  await page.goto(unsummarizedPage)
  await expect(page.getByRole('heading', { name: 'Enginseer', exact: true })).toBeVisible()
  await expect(page.getByText('Rules text isn’t loaded')).toHaveCount(0)
  await expect(page.getByText(unsummarized)).toHaveCount(0)
})

test('the browser never asks a community source for rules text', async ({ page }) => {
  const asked: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).hostname === 'raw.githubusercontent.com') asked.push(request.url())
  })
  await page.goto(rulesPage)
  await expect(page.getByRole('main').locator('[data-rule-summary]').first()).toBeVisible()
  await page.goto(unsummarizedPage)
  await expect(page.getByRole('heading', { name: 'Enginseer', exact: true })).toBeVisible()
  expect(asked).toEqual([])
})

test('a device forgets the community sources it once chose', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('chosen')) localStorage.setItem('praetorium-text-sources', 'bsdata,game-datacards')
    sessionStorage.setItem('chosen', 'yes')
  })
  await page.goto(rulesPage)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('praetorium-text-sources'))).toBeNull()
})
