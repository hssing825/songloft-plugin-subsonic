import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const pluginBundle = spawnSync('unzip', ['-p', join(repoRoot, 'dist', 'subsonic.jsplugin.zip'), 'main.js'], {
  encoding: 'utf8',
})
if (pluginBundle.status !== 0 || !pluginBundle.stdout) throw new Error(pluginBundle.stderr)

test('topone returns an import-safe resolution source without credential URLs', async () => {
  const password = 'TOPONE_SECRET_PASSWORD'
  const config = {
    name: '家庭曲库',
    url: 'https://subsonic.example.test',
    username: 'admin',
    password,
  }
  globalThis.songloft = {
    storage: {
      get: async key => key === 'subsonic_configs' ? JSON.stringify([config]) : null,
      set: async () => {},
    },
    log: { error() {}, info() {}, warn() {} },
  }
  globalThis.__go_crypto_md5 = () => 'unused'
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      'subsonic-response': {
        status: 'ok',
        searchResult3: {
          song: [{
            id: 'song-42',
            title: '目标歌曲',
            artist: '目标歌手',
            album: '目标专辑',
            duration: 210,
            coverArt: 'cover-42',
          }],
        },
      },
    }),
  })

  vm.runInThisContext(pluginBundle.stdout, { filename: 'subsonic-main.js' })
  const response = await globalThis.onHTTPRequest({
    method: 'POST',
    path: '/api/search/topone',
    headers: {},
    body: JSON.stringify({ keyword: '目标歌曲' }),
  })
  const data = JSON.parse(response.body).data

  assert.equal(data.url, '')
  assert.equal(data.plugin_entry_path, 'subsonic')
  assert.deepEqual(data.source_data, { configName: config.name, songId: 'song-42' })
  assert.equal(data.dedup_key, `subsonic_${config.name}_song-42`)
  assert.equal(data.lyric_source, 'url')
  assert.match(data.lyric, /\/lists\/%E5%AE%B6%E5%BA%AD%E6%9B%B2%E5%BA%93\/lyric\?/)
  assert.equal(data.cover_url, undefined)
  assert.equal(JSON.stringify(data).includes(password), false)
})
