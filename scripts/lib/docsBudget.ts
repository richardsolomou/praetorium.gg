/** Guides grow by a paragraph per fix unless something stops them; lower these as the docs shrink. */
export const DOCS_FILE_BUDGET = 20_000
export const DOCS_TOTAL_BUDGET = 240_000

export const isBudgetedDoc = (path: string) => /^docs\/.+\.md$/.test(path) || path === 'CLAUDE.md' || path === 'CONTRIBUTING.md'

export function docsOverBudget(sizes: ReadonlyMap<string, number>): string[] {
  const problems = [...sizes]
    .filter(([, size]) => size > DOCS_FILE_BUDGET)
    .map(([path, size]) => `${path} is ${size} bytes, over the ${DOCS_FILE_BUDGET}-byte file budget`)
  const total = [...sizes.values()].reduce((sum, size) => sum + size, 0)
  if (total > DOCS_TOTAL_BUDGET) problems.push(`Developer docs total ${total} bytes, over the ${DOCS_TOTAL_BUDGET}-byte total budget`)
  return problems
}
