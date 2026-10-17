import fs from 'node:fs'
import path from 'node:path'
import { catalogue } from './stackEnv'
import { expect, test } from './test'

// These tests start where a reader who has not chosen to load rules text starts.
test.use({ rulesText: false })

const coreRules = fs.readFileSync(path.join(catalogue, 'datacards', '11th', 'gdc', 'core', 'core_rules.json'))
const prose = 'The principles of movement are explained here.'

// The pinned upstream file, served from the snapshot it was verified into so the suite never depends on GitHub.
const serveUpstream = (page: import('@playwright/test').Page, body: Buffer) =>
  page.route('https://raw.githubusercontent.com/**', (route) => route.fulfill({ body, contentType: 'text/plain' }))

test('a rules page carries no rules text until the reader loads it', async ({ page }) => {
  await serveUpstream(page, coreRules)
  const response = await page.goto('/rules/core-rules/moving')
  expect(await response?.text()).not.toContain(prose)
  await expect(page.getByRole('heading', { level: 2, name: 'Moving Units' })).toBeVisible()
  await expect(page.getByText(prose)).toHaveCount(0)
  await page.getByRole('button', { name: 'Load rules text' }).click()
  await expect(page.getByText(prose)).toBeVisible()
})

test('the choice to load rules text holds across a reload', async ({ page }) => {
  await serveUpstream(page, coreRules)
  await page.goto('/rules/core-rules/moving')
  await page.getByRole('button', { name: 'Load rules text' }).click()
  await expect(page.getByText(prose)).toBeVisible()
  await page.reload()
  await expect(page.getByText(prose)).toBeVisible()
  await page.getByRole('button', { name: 'Stop loading' }).click()
  await expect(page.getByText(prose)).toHaveCount(0)
})

test('a file that is not the pinned one is refused', async ({ page }) => {
  await serveUpstream(page, Buffer.from(coreRules.toString('utf8').replace(prose, 'Models move however they like.')))
  await page.goto('/rules/core-rules/moving')
  await page.getByRole('button', { name: 'Load rules text' }).click()
  await expect(page.getByRole('alert')).toHaveText('Couldn’t load the rules text from Game Datacards.')
  await expect(page.getByText('Models move however they like.')).toHaveCount(0)
})
