import { createHash } from 'node:crypto'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildPlugin } from '@songloft/plugin-builder'
import JSZip from 'jszip'

const cwd = process.cwd()
const buildDir = join(cwd, 'dist', '_build')

// Keep releases reproducible even while older frozen builders still reuse
// _build and may leave a partial main.jsc behind after a failed compilation.
rmSync(buildDir, { recursive: true, force: true })

const result = await buildPlugin({ cwd })
const zip = await JSZip.loadAsync(readFileSync(result.zipPath))
const manifestFile = zip.file('plugin.json')
if (!manifestFile) {
  throw new Error('Build artifact is missing plugin.json')
}

const manifest = JSON.parse(await manifestFile.async('string'))
const declaredEntry = zip.file(manifest.main)
if (!declaredEntry) {
  throw new Error(`Build artifact is missing declared entry ${manifest.main}`)
}

const sibling = manifest.main.endsWith('.jsc')
  ? manifest.main.replace(/\.jsc$/, '.js')
  : manifest.main.replace(/\.js$/, '.jsc')
let normalized = false
if (zip.file(sibling)) {
  zip.remove(sibling)
  rmSync(join(buildDir, sibling), { force: true })
  normalized = true
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex')
}

const entryHash = sha256(await declaredEntry.async('nodebuffer'))
if (manifest.entryHash !== entryHash) {
  throw new Error(
    `entryHash mismatch for ${manifest.main}: declared=${manifest.entryHash} actual=${entryHash}`,
  )
}

const packageFiles = Object.values(zip.files)
  .filter(entry => !entry.dir && entry.name !== 'plugin.json')
  .sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)
const canonicalParts = []
for (const entry of packageFiles) {
  const content = await entry.async('nodebuffer')
  canonicalParts.push(Buffer.from(`${entry.name}\n${sha256(content)}\n`))
}
manifest.zipHash = sha256(Buffer.concat(canonicalParts))

const embeddedManifestJSON = `${JSON.stringify(manifest, null, 2)}\n`
zip.file('plugin.json', embeddedManifestJSON)
writeFileSync(join(buildDir, 'plugin.json'), embeddedManifestJSON)
writeFileSync(
  result.zipPath,
  await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }),
)

// The registry reads the repository manifest, while installation reads the
// embedded manifest. Keep their entry contract and hashes identical.
const sourceManifestPath = join(cwd, 'plugin.json')
const sourceManifest = JSON.parse(readFileSync(sourceManifestPath, 'utf8'))
sourceManifest.main = manifest.main
sourceManifest.entryHash = manifest.entryHash
sourceManifest.zipHash = manifest.zipHash
writeFileSync(sourceManifestPath, `${JSON.stringify(sourceManifest, null, 2)}\n`)

if (normalized) {
  console.log(`  🧹 removed undeclared sibling entry ${sibling}`)
}
console.log(`  🔑 normalized zipHash: ${manifest.zipHash}`)
