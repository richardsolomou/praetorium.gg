import fs from 'node:fs'
import path from 'node:path'

const accepted = process.argv[2] ?? path.join(import.meta.dirname, '..', 'catalogue', 'accepted-coverage-losses.json')

fs.writeFileSync(accepted, '[]\n')
