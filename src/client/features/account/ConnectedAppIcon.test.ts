import { expect, it } from 'vitest'
import { connectedAppBrand } from './ConnectedAppIcon'

it.each([
  ['Claude', 'claude'],
  ['Claude Code (praetorium)', 'claude'],
  ['ChatGPT', 'openai'],
  ['OpenAI Codex', 'codex'],
  ['codex-mcp-client', 'codex'],
  ['Gemini', 'gemini'],
])('marks %s with its maker', (name, brand) => {
  expect(connectedAppBrand(name)).toBe(brand)
})

it('leaves an unknown app unbranded', () => {
  expect(connectedAppBrand('Test MCP')).toBeUndefined()
})
