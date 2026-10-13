// Test de bout en bout du serveur de synchronisation (deux appareils) — npm test
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { deriveKeys, encryptJson, decryptJson, generateMasterKey } from '../app/utils/sync-crypto.ts'

let proc, dir, base
before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'mb-'))
  const port = 30000 + Math.floor(Math.random() * 20000)
  base = `http://127.0.0.1:${port}`
  proc = spawn(process.execPath, ['sync-server/server.mjs'], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dir, STATIC_DIR: path.join(dir, 'none') }, stdio: 'pipe' })
  await new Promise((res, rej) => { proc.stdout.on('data', d => String(d).includes('serveur') && res()); proc.on('exit', c => rej(new Error('exit ' + c))) })
})
after(async () => { proc?.kill(); await rm(dir, { recursive: true, force: true }) })

const api = (keys, init = {}) => fetch(`${base}/api/vaults/${keys.vaultId}`, { ...init, headers: { Authorization: `Bearer ${keys.token}`, 'Content-Type': 'application/json', ...(init.headers || {}) } })
const put = async (keys, data, baseRev) => api(keys, { method: 'PUT', body: JSON.stringify({ ...(await encryptJson(keys, data)), baseRev }) })

test('création, lecture, version, conflit, accès refusé, suppression', async () => {
  const master = generateMasterKey()
  const phone = await deriveKeys(master), laptop = await deriveKeys(master)

  assert.equal((await api(phone)).status, 404)
  let r = await put(phone, { budget: 1 }, 0)
  assert.equal(r.status, 201)
  assert.equal((await r.json()).rev, 1)

  // Le serveur ne stocke que du chiffré et l'empreinte du jeton.
  const files = await readdir(dir)
  const raw = await readFile(path.join(dir, files.find(f => f.endsWith('.json'))), 'utf8')
  assert.ok(!raw.includes('budget') && !raw.includes(phone.token))

  // Deuxième appareil : lit et déchiffre.
  r = await api(laptop)
  assert.equal(r.status, 200)
  const v1 = await r.json()
  assert.deepEqual(await decryptJson(laptop, v1), { budget: 1 })
  assert.equal((await api(laptop, { headers: { 'If-None-Match': `"${v1.rev}"` } })).status, 304)

  // Modification par l'ordinateur, puis le téléphone écrit sur une version périmée → 409.
  assert.equal((await put(laptop, { budget: 2 }, 1)).status, 200)
  r = await put(phone, { budget: 3 }, 1)
  assert.equal(r.status, 409)
  const cur = await r.json()
  assert.equal(cur.rev, 2)
  assert.deepEqual(await decryptJson(phone, cur), { budget: 2 })
  assert.equal((await put(phone, { budget: 3 }, 2)).status, 200)

  // Mauvais jeton : aucune information (404), aucune écriture possible.
  const intruder = { vaultId: phone.vaultId, token: (await deriveKeys(generateMasterKey())).token }
  assert.equal((await api(intruder)).status, 404)
  assert.equal((await put({ ...intruder, aes: phone.aes }, { evil: 1 }, 3)).status, 404)
  assert.equal((await fetch(`${base}/api/vaults/${phone.vaultId}`)).status, 401)
  assert.equal((await fetch(`${base}/api/vaults/..%2Fetc`, { headers: { Authorization: `Bearer ${phone.token}` } })).status, 400)

  // Suppression.
  assert.equal((await api(intruder, { method: 'DELETE' })).status, 404)
  assert.equal((await api(phone, { method: 'DELETE' })).status, 204)
  assert.equal((await api(phone)).status, 404)
})

test('écritures concurrentes : une seule réussit par version', async () => {
  const keys = await deriveKeys(generateMasterKey())
  await put(keys, { n: 0 }, 0)
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => put(keys, { n: i }, 1)))
  const codes = results.map(r => r.status).sort()
  assert.equal(codes.filter(c => c === 200).length, 1)
  assert.equal(codes.filter(c => c === 409).length, 7)
})
