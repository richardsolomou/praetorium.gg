import { createHash } from 'node:crypto'
import { appendFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { TypeSafeClient } from '@typesafe-ai/sdk'
import { z } from 'zod'
import { classifyCombatRules, COMBAT_RULE_MODEL, combatShortlistMarkdown, inventoryRuleSchema } from './combatRuleShortlist'

const { values } = parseArgs({
  options: {
    input: { type: 'string' },
    output: { type: 'string', default: 'combat-reports' },
    cache: { type: 'string', default: '.combat-rule-cache' },
    model: { type: 'string', default: COMBAT_RULE_MODEL },
    concurrency: { type: 'string', default: '4' },
    'max-requests': { type: 'string', default: '10000' },
    help: { type: 'boolean' },
  },
})
if (values.help) {
  console.log(
    'Usage: pnpm catalogue:combat:shortlist --input inventory.json [--output combat-reports] [--cache .combat-rule-cache] [--model jev-1.13.0] [--concurrency 4] [--max-requests 10000]\nRequires TYPESAFE_API_KEY. Writes report.json and shortlist.md; incomplete audits exit nonzero and retain successful cached judgments.',
  )
} else {
  if (!values.input) throw new Error('Provide --input with the JSON output of pnpm catalogue:combat --json.')
  if (!process.env.TYPESAFE_API_KEY?.trim()) throw new Error('Set TYPESAFE_API_KEY before running the Jev combat audit.')
  if ((await stat(values.input)).size > 50_000_000) throw new Error('Combat inventory exceeds the 50 MB input limit.')
  const bytes = await readFile(values.input, 'utf8')
  const inventory = z
    .object({ revision: z.record(z.string(), z.unknown()), rules: z.array(inventoryRuleSchema).max(30_000) })
    .parse(JSON.parse(bytes))
  const cancellation = new AbortController()
  const cancel = () => cancellation.abort()
  process.once('SIGINT', cancel)
  process.once('SIGTERM', cancel)
  const started = Date.now()
  const result = await classifyCombatRules(inventory.rules, {
    cacheDirectory: path.resolve(values.cache),
    model: values.model,
    concurrency: Number(values.concurrency),
    maxRequests: Number(values['max-requests']),
    signal: cancellation.signal,
    client: new TypeSafeClient({ timeout: 15_000, retry: { maxRetries: 2, maxRetryAfterMs: 10_000 }, logLevel: 'off' }),
  })
  process.off('SIGINT', cancel)
  process.off('SIGTERM', cancel)
  const report = {
    generatedAt: new Date().toISOString(),
    revision: inventory.revision,
    inventorySha256: createHash('sha256').update(bytes).digest('hex'),
    elapsedMs: Date.now() - started,
    ...result,
  }
  await mkdir(values.output, { recursive: true })
  const markdown = combatShortlistMarkdown(result)
  for (const [name, content] of [
    ['report.json', JSON.stringify(report, null, 2) + '\n'],
    ['shortlist.md', markdown],
  ] as const) {
    const file = path.join(values.output, name)
    await writeFile(`${file}.${process.pid}.tmp`, content)
    await rename(`${file}.${process.pid}.tmp`, file)
  }
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown)
  console.log(JSON.stringify({ complete: result.complete, ...result.summary, output: path.resolve(values.output) }, null, 2))
  if (!result.complete) process.exitCode = 1
}
