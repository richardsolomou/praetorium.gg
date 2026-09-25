/** Pull requests compare one pinned snapshot across revisions and fail on regression. The publisher reports upstream disagreement without blocking an otherwise verified snapshot. */

import fs from 'node:fs'

/** Whether a shortfall fails the run. Read per call so a caller can set it and a test can too. */
export const baselinesEnforced = () => process.env.CATALOGUE_BASELINES !== 'report'

/**
 * Records one baseline shortfall.
 *
 * Never throws. Every check in a run reports its own shortfall rather than the first one hiding
 * the rest, and a reported shortfall still reaches a reader through the run summary.
 */
export function baselineShortfall(message: string) {
  console.log(`\n## baseline shortfall\n  ${message}`)
  if (baselinesEnforced()) {
    process.exitCode = 1
    return
  }
  const summary = process.env.GITHUB_STEP_SUMMARY
  if (summary) fs.appendFileSync(summary, `- Catalogue baseline shortfall, published anyway: ${message}\n`)
}
