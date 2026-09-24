import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { baselineShortfall } from './baselines'

const restore = { mode: process.env.CATALOGUE_BASELINES, summary: process.env.GITHUB_STEP_SUMMARY, code: process.exitCode }

afterEach(() => {
  process.env.CATALOGUE_BASELINES = restore.mode
  process.env.GITHUB_STEP_SUMMARY = restore.summary
  if (restore.mode === undefined) delete process.env.CATALOGUE_BASELINES
  if (restore.summary === undefined) delete process.env.GITHUB_STEP_SUMMARY
  process.exitCode = restore.code
})

const summaryFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'baselines-')), 'summary.md')

describe('a baseline shortfall', () => {
  it('fails the run where baselines are enforced', () => {
    delete process.env.CATALOGUE_BASELINES
    baselineShortfall('datasheet name agreement fell below the pinned catalogue baseline')
    expect(process.exitCode).toBe(1)
  })

  it('leaves the run passing where they are only reported', () => {
    process.env.CATALOGUE_BASELINES = 'report'
    baselineShortfall('datasheet name agreement fell below the pinned catalogue baseline')
    expect(process.exitCode).toBe(restore.code)
  })

  it('reaches a reader through the run summary rather than only the log', () => {
    process.env.CATALOGUE_BASELINES = 'report'
    const file = summaryFile()
    process.env.GITHUB_STEP_SUMMARY = file
    baselineShortfall('description coverage fell below the pinned catalogue baseline')
    expect(fs.readFileSync(file, 'utf8')).toContain('description coverage fell below the pinned catalogue baseline')
  })

  it('records every shortfall in one run rather than stopping at the first', () => {
    process.env.CATALOGUE_BASELINES = 'report'
    const file = summaryFile()
    process.env.GITHUB_STEP_SUMMARY = file
    baselineShortfall('datasheet name agreement fell below the pinned catalogue baseline')
    baselineShortfall('description coverage fell below the pinned catalogue baseline')
    expect(fs.readFileSync(file, 'utf8').trim().split('\n')).toHaveLength(2)
  })

  it('reports without a run summary to write to', () => {
    process.env.CATALOGUE_BASELINES = 'report'
    delete process.env.GITHUB_STEP_SUMMARY
    expect(() => baselineShortfall('description coverage fell below the pinned catalogue baseline')).not.toThrow()
  })
})
