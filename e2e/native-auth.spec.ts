import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { eq } from 'drizzle-orm'
import { nativeAuthCompletionScript, nativeAuthConsumeScript, nativeAuthExchangeScript } from '../mobile/src/nativeAuth'
import { openDatabase } from '../src/db/connection'
import { account, user } from '../src/db/schema'
import { signUp, uniqueName } from './account'
import { baseURL, postgresPort } from './stackEnv'

test('a native proof signs the WebView in and survives its final reload', async ({ browser }) => {
  const systemPage = await (await browser.newContext()).newPage()
  const name = uniqueName('Native auth')
  await signUp(systemPage, name)

  const connection = openDatabase(`postgres://praetorium:praetorium@127.0.0.1:${postgresPort}/praetorium`)
  try {
    const [player] = await connection.database.select({ id: user.id }).from(user).where(eq(user.name, name)).limit(1)
    if (!player) throw new Error('The native authentication player is missing.')
    await connection.database.insert(account).values({
      id: randomUUID(),
      accountId: randomUUID(),
      issuer: 'https://accounts.google.com',
      providerId: 'google',
      userId: player.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  } finally {
    await connection.close()
  }

  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const exchange = await systemPage.evaluate(
    async (body) => {
      const response = await fetch('/api/auth/native-auth-token/generate', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) throw new Error(`Native proof generation returned ${response.status}.`)
      return (await response.json()) as { id: string; token: string }
    },
    { action: 'sign-in', challenge, next: '/rosters', provider: 'google' },
  )
  await systemPage.context().close()

  const callback = {
    kind: 'success' as const,
    action: 'sign-in' as const,
    provider: 'google' as const,
    next: '/rosters',
    challenge,
    verifier,
    ...exchange,
  }
  const messages: string[] = []
  const webViewContext = await browser.newContext({ bypassCSP: true })
  await webViewContext.exposeBinding('postNativeMessage', (_source, message: string) => {
    messages.push(message)
  })
  await webViewContext.addInitScript({
    content: `window.PraetoriumNative = { bridgeVersion: 3 };
window.ReactNativeWebView = { postMessage: (message) => window.postNativeMessage(message) };
${nativeAuthCompletionScript(baseURL)}`,
  })
  const webView = await webViewContext.newPage()
  await webView.goto('/sign-in')
  await expect(webView.getByRole('heading', { name: 'Welcome back' })).toBeVisible()

  await webView.evaluate((script) => {
    window.eval(script)
  }, nativeAuthExchangeScript(callback))

  await webView.waitForURL(`${baseURL}/rosters`)
  await expect(webView.getByRole('button', { name: `Account menu for ${name}` })).toBeVisible()
  await expect
    .poll(() => messages.map((message) => JSON.parse(message) as unknown))
    .toContainEqual({ version: 2, type: 'native-auth-result', id: exchange.id, ok: true, retryable: false })

  const consumed = webView.waitForResponse((response) => response.url().endsWith('/api/auth/native-auth-token/consume'))
  await webView.evaluate((script) => {
    window.eval(script)
  }, nativeAuthConsumeScript(callback))
  expect((await consumed).status()).toBe(200)
  await expect(webView.getByRole('button', { name: `Account menu for ${name}` })).toBeVisible()
  await webViewContext.close()
})
