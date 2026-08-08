import type { Page } from '@playwright/test'

/**
 * Makes an account and leaves the page signed into it.
 *
 * Every journey starts here now: a battle, a roster and a seat all belong to an
 * account, so there is no way to reach any of them otherwise. The email is unique
 * per call because the suite shares one database across specs.
 */
export async function signUp(page: Page, name: string) {
  await page.goto('/signin')
  await page.getByRole('button', { name: 'I need an account' }).click()
  await page.getByLabel('Your name').fill(name)
  await page.getByLabel('Email').fill(`${name.toLowerCase()}-${crypto.randomUUID()}@example.test`)
  await page.getByLabel('Password').fill('a-long-enough-password')
  await page.getByRole('button', { name: 'Create the account' }).click()
  await page.getByRole('button', { name: new RegExp(`${name} · sign out`) }).waitFor()
}
