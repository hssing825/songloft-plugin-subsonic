import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

function readJSON(name) {
  return JSON.parse(readFileSync(join(repoRoot, name), 'utf8'))
}

test('npm is the single lock source and release metadata is synchronized', () => {
  const packageJSON = readJSON('package.json')
  const manifest = readJSON('plugin.json')
  const lock = readJSON('package-lock.json')
  const rootLock = lock.packages['']

  assert.equal(existsSync(join(repoRoot, 'pnpm-lock.yaml')), false)
  assert.equal(manifest.version, packageJSON.version)
  assert.equal(lock.version, packageJSON.version)
  assert.equal(rootLock.version, packageJSON.version)
  assert.deepEqual(rootLock.devDependencies, packageJSON.devDependencies)
  assert.match(
    manifest.download_url,
    new RegExp(`/v${packageJSON.version}/subsonic\\.jsplugin\\.zip$`),
  )
})
