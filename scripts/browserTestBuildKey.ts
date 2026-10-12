import path from 'node:path'
import { browserTestBuildFingerprint } from './lib/browserTestBuild'

console.log(await browserTestBuildFingerprint(process.cwd(), path.resolve(process.env.CATALOGUE_DIR ?? 'catalogue-data'), process.env))
