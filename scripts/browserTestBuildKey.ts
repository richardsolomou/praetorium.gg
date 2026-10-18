import path from 'node:path'
import { browserTestBuildFingerprint } from './lib/browserTestBuild'
import { catalogueDataDirectory } from './lib/catalogueFiles'

console.log(await browserTestBuildFingerprint(process.cwd(), path.resolve(catalogueDataDirectory()), process.env))
