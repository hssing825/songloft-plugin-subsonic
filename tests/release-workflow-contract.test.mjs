import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const workflow = readFileSync(join(repoRoot, '.github', 'workflows', 'release.yml'), 'utf8')

test('release workflow checks out and pushes the repository default branch explicitly', () => {
  assert.match(
    workflow,
    /ref:\s*\$\{\{\s*github\.event\.repository\.default_branch\s*\}\}/,
  )
  assert.match(
    workflow,
    /git push origin "HEAD:\$\{\{\s*github\.event\.repository\.default_branch\s*\}\}"/,
  )
  assert.doesNotMatch(workflow, /^\s*git push\s*$/m)
})

test('release workflow can resume after the immutable release asset was created', () => {
  assert.match(workflow, /Release \$\{TAG\} already exists; reusing immutable asset/)
  assert.match(workflow, /gh release view "\$\{TAG\}" --json assets/)
  assert.match(workflow, /grep -Fxq "\$\{ZIP_NAME\}"/)
  assert.doesNotMatch(workflow, /gh release (?:delete|upload)[^\n]*--clobber/)
})
