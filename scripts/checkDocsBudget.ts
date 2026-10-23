import { execFileSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { docsOverBudget, isBudgetedDoc } from './lib/docsBudget'

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .split('\n')
  .filter((file) => isBudgetedDoc(file) && existsSync(file))
const problems = docsOverBudget(new Map(files.map((file) => [file, statSync(file).size])))
if (problems.length) {
  console.error([...problems, 'Move detail to a test, a code comment or an area guide instead of raising the budget.'].join('\n'))
  process.exit(1)
}
