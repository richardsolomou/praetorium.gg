import { PRODUCT_DOCS } from '../src/contracts/productDocs'
import { expect, test } from './test'
import { expectNoPageOverflow } from './account'

const pages = [
  { path: '/rosters', title: 'Warhammer 40,000 army builder' },
  { path: '/rosters?limit=1000&visibility=public', canonical: '/rosters', title: 'Warhammer 40,000 army builder' },
  { path: '/battles', title: 'Warhammer 40,000 battle tracker' },
  { path: '/tournaments', title: 'Tournaments' },
  { path: '/sources', title: 'Data sources' },
  { path: '/support', title: 'Support' },
  { path: '/privacy', title: 'Privacy policy' },
  { path: '/terms', title: 'Terms of service' },
  { path: '/delete-account', title: 'Delete account' },
  { path: '/docs', title: 'Praetorium docs' },
]

test('Terms account requirements match public guest tools', async ({ page }, testInfo) => {
  const atEachWidth = async (check: (width: number) => Promise<void>) => {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await check(width)
    }
    await page.setViewportSize({ width: 1440, height: 900 })
  }
  await page.goto('/terms')
  const service = page.locator('main section').filter({ has: page.getByRole('heading', { name: 'The service', exact: true }) })
  await atEachWidth(async (width) => {
    await expect(service.locator('p').first()).toContainText('You can use the builder, simulator and public reference without an account.')
    await expect(service.locator('p').first()).toContainText('Sign in to save rosters to the service or start battles.')
    await expectNoPageOverflow(page)
    await page.screenshot({ path: testInfo.outputPath(`guest-terms-${width}.png`) })
  })

  await page.goto('/')
  const tryBuilder = page.getByRole('link', { name: 'Try the builder', exact: true })
  await atEachWidth(() => expect(tryBuilder).toBeVisible())
  await tryBuilder.click()
  await expect(page).toHaveURL('/rosters')
  await atEachWidth(async () => {
    await expect(page.getByRole('heading', { name: 'Rosters', exact: true, level: 1 })).toBeVisible()
    await expect(page.getByRole('button', { name: 'New roster', exact: true })).toBeVisible()
  })

  await page.goto('/simulator')
  await atEachWidth(async () => {
    await expect(page.getByRole('heading', { name: 'Combat simulator', exact: true })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Attacker unit', exact: true })).toHaveAttribute('aria-busy', 'false')
    await expect(page.getByRole('combobox', { name: 'Defender unit', exact: true })).toHaveAttribute('aria-busy', 'false')
  })

  await page.goto('/factions/space-marines')
  await atEachWidth(() => expect(page.getByRole('heading', { level: 1, name: 'Space Marines', exact: true })).toBeVisible())

  await page.goto('/battles')
  await atEachWidth(async () => {
    await expect(page.getByRole('button', { name: 'New battle', exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Sign in to play', exact: true })).toHaveAttribute('href', '/sign-in?next=%2Fbattles')
  })
})

test('public product pages deliver their own metadata and canonical URLs without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  for (const details of pages) {
    await page.goto(new URL(details.path, baseURL).href)
    await expect(page).toHaveTitle(`${details.title} — Praetorium`)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new URL(details.canonical ?? details.path, baseURL).href)
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', details.title)
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      'content',
      new URL(details.canonical ?? details.path, baseURL).href,
    )
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /\S/)
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
  }
  await context.close()
})

test('faction datasheet indexes deliver their own canonical metadata without JavaScript', async ({ browser, baseURL }, testInfo) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto(new URL('/factions/space-marines/datasheets', baseURL).href)
  const destination = page.url()
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(destination)
    await expect(page).toHaveTitle('Space Marines datasheets — Praetorium')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', destination)
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Space Marines/)
    await expect(page.getByRole('heading', { level: 1, name: 'Datasheets', exact: true })).toBeVisible()
    await expectNoPageOverflow(page)
    await page.screenshot({ path: testInfo.outputPath(`datasheet-index-${width}.png`) })
  }
  await page.locator('main a[href*="/datasheets/"]').first().click()
  await expect(page).not.toHaveTitle('Space Marines datasheets — Praetorium')
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1)
  await context.close()
})

for (const doc of PRODUCT_DOCS) {
  test(`the ${doc.slug} doc is readable without JavaScript on desktop and phone`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: false })
    const page = await context.newPage()
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      const response = await page.goto(new URL(`/docs/${doc.slug}`, baseURL).href)
      expect(response?.status()).toBe(200)
      await expect(page).toHaveTitle(`${doc.title} — Praetorium`)
      await expect(page.getByRole('heading', { level: 1, name: doc.title })).toBeVisible()
      await expect(page.locator('main article')).not.toBeEmpty()
      for (const image of await page.locator('main article img').all()) {
        await image.scrollIntoViewIfNeeded()
        await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
        await expect(image).toHaveAttribute('alt', /\S/)
      }
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new URL(`/docs/${doc.slug}`, baseURL).href)
      expect(
        await page
          .locator('script[type="application/ld+json"]')
          .evaluateAll((elements) => elements.map((element) => JSON.parse(element.textContent))),
      ).toEqual([
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Docs', item: new URL('/docs', baseURL).href },
            { '@type': 'ListItem', position: 2, name: doc.title, item: new URL(`/docs/${doc.slug}`, baseURL).href },
          ],
        },
      ])
      await expectNoPageOverflow(page)
    }
    await context.close()
  })
}

test('docs can be discovered from the home page, sitemap and agent text', async ({ page, request }, testInfo) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Read the docs', exact: true }).click()
  await expect(page).toHaveURL('/docs')
  for (const doc of PRODUCT_DOCS)
    await expect(page.locator('main').getByRole('link', { name: doc.title, exact: true })).toHaveAttribute('href', `/docs/${doc.slug}`)
  await expect(page.locator('footer').getByRole('link', { name: 'Docs', exact: true })).toHaveAttribute('href', '/docs')
  await page.screenshot({ path: testInfo.outputPath('docs-index-1440.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 900 })
  await expectNoPageOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('docs-index-390.png'), fullPage: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  const sitemap = await (await request.get('/sitemap.xml')).text()
  const llms = await (await request.get('/llms.txt')).text()
  for (const doc of PRODUCT_DOCS) {
    expect(sitemap).toContain(`/docs/${doc.slug}</loc>`)
    expect(llms).toContain(`/docs/${doc.slug})`)
  }
  expect(sitemap).not.toMatch(/<loc>[^<]*\/missions<\/loc>/)
  await page.getByRole('button', { name: 'Search Praetorium', exact: true }).filter({ visible: true }).click()
  await page.getByPlaceholder('Search everything…').fill('import')
  await page.getByRole('option').filter({ hasText: 'Import a list' }).click()
  await expect(page).toHaveURL('/docs/import-a-list')
})

test('the docs search finds a problem by its symptom and opens its fix', async ({ page }) => {
  await page.goto('/docs')
  await page.getByRole('textbox', { name: 'Search docs' }).fill('optimize greyed')
  const results = page.getByRole('region', { name: 'Search results' })
  await results.getByRole('link', { name: /Optimize is greyed out/ }).click()
  await expect(page).toHaveURL('/docs/simulator-problems#optimize-is-greyed-out')
  await expect(page.getByRole('heading', { level: 3, name: 'Optimize is greyed out' })).toBeInViewport()
})

for (const [from, to] of [
  ['/guides', '/docs'],
  ['/guides/import-a-roster', '/docs/import-a-list'],
  ['/guides/plan-your-scoring', '/docs'],
] as const) {
  test(`the old guide address ${from} moves permanently to ${to}`, async ({ request }) => {
    const response = await request.get(from, { maxRedirects: 0 })
    expect([response.status(), new URL(response.headers()['location'], 'http://x').pathname]).toEqual([301, to])
  })
}

test('unknown docs and guides return a real 404', async ({ request }) => {
  expect([(await request.get('/docs/not-a-doc')).status(), (await request.get('/guides/not-a-guide')).status()]).toEqual([404, 404])
})

// Titles name each path in words: two titles that differ only by punctuation share one output directory.
for (const [path, name] of [
  ['/rules/not-a-document', 'an unknown document'],
  ['/rules/%24documentId', 'a route placeholder'],
  ['/rules/%24documentId/', 'a route placeholder with a trailing slash'],
  ['/rules/not-a-document/not-a-section', 'an unknown section'],
] as const) {
  test(`${name} returns a real rules 404`, async ({ page }, testInfo) => {
    const response = await page.goto(path)
    expect(response?.status()).toBe(404)
    await expect(page.getByRole('heading', { name: 'Nothing here', exact: true })).toBeVisible()
    if (path === '/rules/%24documentId') await page.screenshot({ path: testInfo.outputPath('invalid-rules.png') })
  })
}

test('rules documents still link to readable sections', async ({ page }) => {
  const response = await page.goto('/rules/core-rules')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1, name: 'Core Rules', exact: true })).toBeVisible()
  await page.locator('main a[href="/rules/core-rules/moving"]').click()
  await expect(page).toHaveURL('/rules/core-rules/moving')
  await expect(page.getByRole('heading', { level: 1, name: '03. Moving', exact: true })).toBeVisible()
  const section = await page.goto('/rules/core-rules/moving')
  expect(section?.status()).toBe(200)
})

test('a docs screenshot opens at full size in a dialog', async ({ page }) => {
  await page.goto('/docs/modifiers')
  await page
    .getByRole('button', { name: /^Enlarge screenshot: / })
    .first()
    .click()
  const dialog = page.getByRole('dialog')
  await expect(
    dialog.getByRole('heading', { name: 'The All, Shooting and Melee tabs choose which attacks a modifier affects' }),
  ).toBeVisible()
  await expect.poll(() => dialog.getByRole('img').evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  await expect(page).toHaveURL('/docs/modifiers')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})
