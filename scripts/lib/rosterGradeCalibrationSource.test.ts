import fs from 'node:fs'
import { expect, it } from 'vitest'
import { CALIBRATED, EXPECTED_TOOLS, PEERS } from '../../src/core/rosterGradeCalibration'
import { CALIBRATION_FILE, calibrationSource } from './rosterGradeCalibrationSource'

it('writes the committed calibration table exactly, so a rebuild changes only its numbers', () => {
  expect(calibrationSource(CALIBRATED, EXPECTED_TOOLS, PEERS)).toBe(fs.readFileSync(CALIBRATION_FILE, 'utf8'))
})
