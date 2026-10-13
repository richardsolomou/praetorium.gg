import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import pin from '../catalogue/authoring.json' with { type: 'json' }

const root = path.resolve(import.meta.dirname, '..')
const output = path.join(root, '.catalogue-authoring')
const override = process.env.CATALOGUE_AUTHORING_DIR
const marker = JSON.stringify(pin)
if (!/^[\w.-]+\/[\w.-]+$/.test(pin.repository) || !/^[a-f0-9]{40}$/.test(pin.revision)) throw new Error('Invalid catalogue authoring pin')

if (override) {
  const source = path.resolve(override)
  if (!fs.existsSync(path.join(source, 'catalogue/sources.json'))) throw new Error('Catalogue authoring override is incomplete')
  if (source === output) throw new Error('Catalogue authoring override cannot replace itself')
  if (!fs.lstatSync(output, { throwIfNoEntry: false })?.isSymbolicLink() || fs.realpathSync(output) !== fs.realpathSync(source)) {
    fs.rmSync(output, { recursive: true, force: true })
    fs.symlinkSync(source, output, 'dir')
  }
} else if (!fs.existsSync(path.join(output, '.pin.json')) || fs.readFileSync(path.join(output, '.pin.json'), 'utf8') !== marker) {
  const staging = `${output}.${randomUUID()}`
  const archive = `${staging}.tar.gz`
  try {
    const response = await fetch(`https://codeload.github.com/${pin.repository}/tar.gz/${pin.revision}`, {
      signal: AbortSignal.timeout(60_000),
    })
    if (!response.ok) throw new Error(`Catalogue authoring download answered ${response.status}`)
    if (!response.body) throw new Error('Catalogue authoring response has no body')
    const chunks: Uint8Array[] = []
    let size = 0
    for await (const chunk of response.body) {
      size += chunk.length
      if (size > 8 * 1024 * 1024) throw new Error('Catalogue authoring archive is too large')
      chunks.push(chunk)
    }
    const bytes = Buffer.concat(chunks)
    fs.writeFileSync(archive, bytes)
    fs.mkdirSync(staging)
    execFileSync('tar', ['-xzf', archive, '--strip-components=1', '-C', staging], { stdio: 'pipe' })
    for (const name of ['sources.json', 'composition.json', 'revocations.json']) {
      JSON.parse(fs.readFileSync(path.join(staging, 'catalogue', name), 'utf8'))
    }
    fs.writeFileSync(path.join(staging, '.pin.json'), marker)
    const previous = `${output}.previous-${randomUUID()}`
    if (fs.existsSync(output)) fs.renameSync(output, previous)
    try {
      fs.renameSync(staging, output)
    } catch (error) {
      if (fs.existsSync(previous)) fs.renameSync(previous, output)
      throw error
    }
    fs.rmSync(previous, { recursive: true, force: true })
  } finally {
    fs.rmSync(staging, { recursive: true, force: true })
    fs.rmSync(archive, { force: true })
  }
}
