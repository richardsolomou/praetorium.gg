import { expect, it } from 'vitest'
import { DOCS_FILE_BUDGET, DOCS_TOTAL_BUDGET, docsOverBudget, isBudgetedDoc } from './docsBudget'

it('accepts guides within both budgets', () => {
  expect(docsOverBudget(new Map([['docs/a.md', DOCS_FILE_BUDGET]]))).toEqual([])
})

it('names a guide over the file budget', () => {
  expect(docsOverBudget(new Map([['docs/a.md', DOCS_FILE_BUDGET + 1]]))).toEqual([
    `docs/a.md is ${DOCS_FILE_BUDGET + 1} bytes, over the ${DOCS_FILE_BUDGET}-byte file budget`,
  ])
})

it('reports guides that together exceed the total budget', () => {
  const sizes = new Map(
    Array.from({ length: Math.ceil(DOCS_TOTAL_BUDGET / DOCS_FILE_BUDGET) + 1 }, (_, at) => [`docs/${at}.md`, DOCS_FILE_BUDGET]),
  )
  expect(docsOverBudget(sizes)).toEqual([
    `Developer docs total ${DOCS_FILE_BUDGET * sizes.size} bytes, over the ${DOCS_TOTAL_BUDGET}-byte total budget`,
  ])
})

it.each(['docs/deployment.md', 'docs/development/catalogue-data/sources.md', 'CLAUDE.md', 'CONTRIBUTING.md'])('budgets %s', (path) => {
  expect(isBudgetedDoc(path)).toBe(true)
})

it.each(['README.md', 'CHANGELOG.md', 'src/client/features/docs/content/search.md', 'docs/diagram.png'])('does not budget %s', (path) => {
  expect(isBudgetedDoc(path)).toBe(false)
})
