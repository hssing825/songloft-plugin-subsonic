import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { loadExecutablePluginBundle } from './helpers/load-plugin-bundle.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const pluginBundle = await loadExecutablePluginBundle(repoRoot)

function loadPlugin({
  token,
  fetchCalls,
  imageBytes = [],
  responseStatus = 200,
  fetchError,
}) {
  globalThis.songloft = {
    storage: {
      get: async key => key === 'subsonic_server_config'
        ? JSON.stringify({ enabled: true, username: 'admin', password: 'secret' })
        : null,
    },
    plugin: {
      getToken: async () => token,
      getHostUrl: async () => 'http://127.0.0.1:58091',
    },
    log: {
      error() {},
      info() {},
      warn() {},
    },
  }
  globalThis.__go_crypto_md5 = () => 'unused'
  globalThis.fetch = async url => {
    fetchCalls.push(String(url))
    if (fetchError) throw fetchError
    return {
      ok: responseStatus >= 200 && responseStatus < 300,
      status: responseStatus,
      headers: new Headers({
        'cache-control': 'private, max-age=60',
        'content-type': 'image/png',
      }),
      arrayBuffer: async () => Uint8Array.from(imageBytes).buffer,
    }
  }

  vm.runInThisContext(pluginBundle, { filename: 'subsonic-main.js' })
  return globalThis.onHTTPRequest
}

function createCoverRequest(id) {
  return {
    method: 'GET',
    path: '/rest/getCoverArt',
    headers: {},
    body: null,
    query: `u=admin&p=secret&id=${encodeURIComponent(id)}&f=json`,
  }
}

test('getCoverArt proxies song covers without exposing the host plugin token', async () => {
  const token = 'P0_SECRET_PLUGIN_JWT'
  const fetchCalls = []
  const onHTTPRequest = loadPlugin({ token, fetchCalls, imageBytes: [1, 2, 3] })

  const response = await onHTTPRequest(createCoverRequest('42'))

  assert.equal(response.statusCode, 200)
  assert.equal(response.headers.Location, undefined)
  assert.equal(response.headers['Content-Type'], 'image/png')
  assert.deepEqual(Array.from(response.body), [1, 2, 3])
  assert.equal(JSON.stringify(response).includes(token), false)
  assert.deepEqual(fetchCalls, [
    `http://127.0.0.1:58091/api/v1/songs/42/cover?access_token=${token}`,
  ])
})

test('getCoverArt proxies playlist covers without exposing the host plugin token', async () => {
  const token = 'P0_SECRET_PLUGIN_JWT'
  const fetchCalls = []
  const onHTTPRequest = loadPlugin({ token, fetchCalls, imageBytes: [4, 5, 6] })

  const response = await onHTTPRequest(createCoverRequest('pl-7'))

  assert.equal(response.statusCode, 200)
  assert.equal(response.headers.Location, undefined)
  assert.equal(JSON.stringify(response).includes(token), false)
  assert.deepEqual(fetchCalls, [
    `http://127.0.0.1:58091/api/v1/playlists/7/cover?access_token=${token}`,
  ])
})

test('getCoverArt rejects invalid IDs before reading or exposing the host token', async () => {
  const token = 'P0_SECRET_PLUGIN_JWT'
  const fetchCalls = []
  const onHTTPRequest = loadPlugin({ token, fetchCalls })

  const songResponse = await onHTTPRequest(createCoverRequest('ar-artist-name'))
  const playlistResponse = await onHTTPRequest(createCoverRequest('pl-not-a-number'))

  assert.equal(songResponse.statusCode, 404)
  assert.equal(playlistResponse.statusCode, 404)
  assert.equal(JSON.stringify([songResponse, playlistResponse]).includes(token), false)
  assert.deepEqual(fetchCalls, [])
})

test('getCoverArt forwards host cover failures without exposing the host token', async () => {
  const token = 'P0_SECRET_PLUGIN_JWT'
  const fetchCalls = []
  const onHTTPRequest = loadPlugin({ token, fetchCalls, responseStatus: 404 })

  const response = await onHTTPRequest(createCoverRequest('42'))

  assert.equal(response.statusCode, 404)
  assert.equal(response.headers.Location, undefined)
  assert.equal(JSON.stringify(response).includes(token), false)
})

test('getCoverArt returns 502 when the internal cover request fails', async () => {
  const token = 'P0_SECRET_PLUGIN_JWT'
  const fetchCalls = []
  const onHTTPRequest = loadPlugin({
    token,
    fetchCalls,
    fetchError: new Error('internal fetch failed'),
  })

  const response = await onHTTPRequest(createCoverRequest('42'))

  assert.equal(response.statusCode, 502)
  assert.equal(response.headers.Location, undefined)
  assert.equal(JSON.stringify(response).includes(token), false)
})
