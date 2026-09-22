import { expect, it } from 'vitest'
import { referenceMarkdown, referenceText } from './referenceText'

it('reads known source markup without treating arbitrary angle-bracketed words as tags', () => {
  expect(referenceText('A <b>visible</b> unit keeps its <move type>.')).toBe('A visible unit keeps its <move type>.')
})

it('turns source lists into searchable lines and Markdown', () => {
  const source = '<ul><li>First <k>keyword</k>.</li><li>Second.</li></ul>'
  expect(referenceText(source)).toBe('- First keyword.\n- Second.')
  expect(referenceMarkdown(source)).toBe('- First `keyword`.\n- Second.')
})

it('removes non-printing source controls without collapsing lines', () => {
  expect(referenceText('1. Start\r\n2.\b End')).toBe('1. Start\n2. End')
  expect(referenceMarkdown('1. Start\r\n2.\b End')).toBe('1. Start\n2. End')
})
