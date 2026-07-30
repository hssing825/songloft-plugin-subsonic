import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const bundlePath = join(repoRoot, 'dist', 'subsonic.jsplugin.zip')
const pluginBundle = spawnSync('unzip', ['-p', bundlePath, 'main.js'], {
  encoding: 'utf8',
})

if (pluginBundle.status !== 0 || !pluginBundle.stdout) {
  throw new Error(`Failed to read main.js from build artifact: ${pluginBundle.stderr}`)
}

function loadPlugin(searchCalls) {
  const songs = Array.from({ length: 45 }, (_, index) => ({
    id: index + 1,
    title: `Match ${index + 1}`,
    artist: `Artist ${Math.floor(index / 5) + 1}`,
    album: `Album ${Math.floor(index / 3) + 1}`,
    duration: 180,
  }))

  globalThis.songloft = {
    songs: {
      search: async (query, options) => {
        searchCalls.push({ query, options })
        const limit = options?.limit ?? 20
        const offset = options?.offset ?? 0
        return songs.slice(offset, offset + limit)
      },
      list: async () => songs,
    },
    storage: {
      get: async key => key === 'subsonic_server_config'
        ? JSON.stringify({ enabled: true, username: 'admin', password: 'secret' })
        : null,
    },
    log: {
      error() {},
      info() {},
      warn() {},
    },
  }
  globalThis.__go_crypto_md5 = () => 'unused'

  vm.runInThisContext(pluginBundle.stdout, { filename: 'subsonic-main.js' })
  return globalThis.onHTTPRequest
}

test('search3 paginates beyond the host default and aggregates all matches', async () => {
  const searchCalls = []
  const onHTTPRequest = loadPlugin(searchCalls)
  const requestPage = async (songOffset, songCount) => {
    const response = await onHTTPRequest({
      method: 'GET',
      path: '/rest/search3',
      headers: {},
      body: null,
      query: [
        'u=admin',
        'p=secret',
        'f=json',
        'query=Match',
        `songCount=${songCount}`,
        `songOffset=${songOffset}`,
        'artistCount=20',
        'albumCount=20',
      ].join('&'),
    })
    assert.equal(response.statusCode, 200)
    return JSON.parse(response.body)['subsonic-response'].searchResult3
  }

  const firstPage = await requestPage(0, 20)
  const secondPage = await requestPage(20, 20)
  const thirdPage = await requestPage(40, 20)
  const ids = [...firstPage.song, ...secondPage.song, ...thirdPage.song].map(song => song.id)

  assert.deepEqual(searchCalls, Array.from({ length: 3 }, () => ({
    query: 'Match',
    options: { limit: 100000, offset: 0 },
  })))
  assert.deepEqual(ids, Array.from({ length: 45 }, (_, index) => String(index + 1)))
  assert.equal(new Set(ids).size, 45)
  assert.equal(secondPage.artist.length, 9)
  assert.equal(secondPage.album.length, 15)
})
