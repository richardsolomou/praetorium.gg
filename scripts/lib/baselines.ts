/**
 * Pinned baselines, and the one job that reads a shortfall as news rather than as a regression.
 *
 * A baseline only says "this got worse" next to something to compare against. The `points` job
 * has that comparison: it measures one pinned snapshot against both revisions of a pull request,
 * so a number that moved is a number this repository moved. The snapshot publisher has no
 * comparison, because fetching data nobody here controls is the whole job. There the same number
 * moves when two upstreams disagree about a name, and refusing to publish holds every unrelated
 * part of the refresh back for as long as they disagree. So the publisher records the shortfall
 * and publishes anyway.
 *
 * This covers agreement between sources and nothing else. Integrity is a separate question with
 * its own answers, which stay strict: `isComplete` refuses an incomplete snapshot, and packing
 * verifies checksums, paths, size and contents against the archive it published.
 */

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
