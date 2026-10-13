import { spawn } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
// Simulation de deux appareils synchronisés via le vrai serveur, avec le vrai code
// de l'application (composables/useSync.ts). Lancer : npm run test:e2e
const ROOT = new URL('../../', import.meta.url)
const core = await import(new URL('app/utils/budget-core.ts', ROOT).href)

// Environnement navigateur minimal
const store = new Map()
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) }
globalThis.location = { origin: 'https://budget.test' }

const dir = await mkdtemp(path.join(tmpdir(), 'mb-e2e-'))
const port = 41000 + Math.floor(Math.random() * 9000)
const srv = spawn(process.execPath, [new URL('sync-server/server.mjs', ROOT).pathname], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dir, STATIC_DIR: dir + '/x' } })
await new Promise(r => srv.stdout.on('data', d => String(d).includes('serveur') && r()))
const base = `http://127.0.0.1:${port}`
// Le module de synchro utilise des URL relatives (/api/…) : on préfixe ici l'adresse du serveur.
const realFetch = globalThis.fetch
globalThis.fetch = (u, i) => realFetch(String(u).startsWith('/') ? base + u : u, i)

function device(seedDemo) {
  const S = core.emptyState(); core.seedStructure(S); if (seedDemo) core.seedDemo(S); core.regenerateAll(S)
  return { S, replaceState(n) { Object.assign(S, n) } }
}
let n = 0
async function makeDevice(dev) {
  globalThis.useBudget = () => dev
  const mod = await import(new URL(`app/composables/useSync.ts?d=${++n}`, ROOT).href)
  const api = mod.useSync()
  return api
}
const canon = S => JSON.stringify(core.normalize(JSON.parse(JSON.stringify(S))))

const devA = device(true), devB = device(false)
const A = await makeDevice(devA), B = await makeDevice(devB)
// start() attache des écouteurs DOM : on règle seulement l'adresse via un appel direct
globalThis.document = { addEventListener() {}, visibilityState: 'hidden' }
globalThis.window = { addEventListener() {} }
await A.start(''); await B.start('')

await A.enable()
assert.equal(A.sync.status, 'idle'); assert.equal(A.sync.rev, 1)
console.log('1. A active la synchro : coffre créé, version', A.sync.rev)

const link = A.shareUrl()
assert.match(link, /^https:\/\/budget\.test\/lier#cle=[A-Za-z0-9_-]{43}$/)
await B.join(A.masterKey())
assert.equal(canon(devB.S), canon(devA.S))
console.log('2. B rejoint avec la clé du QR code : budgets identiques (', devB.S.txns.length, 'opérations )')

// Modifications concurrentes
devA.S.txns.push({ id: 'cafe', date: core.today(), label: 'Café', amount: 3.2, type: 'expense', accountId: devA.S.accounts[0].id, walletId: null, toAccountId: null, toWalletId: null, categoryId: null, recurrenceId: null })
const boul = devB.S.txns.find(t => t.label === 'Boulangerie').id
devB.S.txns = devB.S.txns.filter(t => t.id !== boul)
devB.S.accounts[1].wallets.push({ id: 'w-auto', name: 'Voiture', initial: 0, goal: 3000 })
await A.syncNow()   // A envoie (v2)
await B.syncNow()   // B : récupère v2, fusionne, envoie v3
await A.syncNow()   // A récupère v3
assert.equal(canon(devA.S), canon(devB.S))
assert.ok(devA.S.txns.some(t => t.id === 'cafe') && !devA.S.txns.some(t => t.id === boul))
assert.ok(devA.S.accounts[1].wallets.some(w => w.name === 'Voiture'))
console.log('3. modifications simultanées fusionnées sur les deux appareils, version', A.sync.rev)

// Conflit pur : les deux écrivent sur la même version
devA.S.plans['2031-01'] = { [devA.S.categories[0].id]: 100 }
devB.S.plans['2031-02'] = { [devB.S.categories[1].id]: 200 }
await Promise.all([A.syncNow(), B.syncNow()])
await A.syncNow(); await B.syncNow()
assert.equal(canon(devA.S), canon(devB.S))
assert.ok(devA.S.plans['2031-01'] && devA.S.plans['2031-02'])
console.log('4. écritures simultanées (409) résolues, version', A.sync.rev)
// Convergence : plus rien à envoyer, la version ne bouge plus.
const rev = A.sync.rev
await A.syncNow(); await B.syncNow(); await A.syncNow(); await B.syncNow()
assert.equal(A.sync.rev, rev); assert.equal(B.sync.rev, rev)
console.log('4b. appareils stables : aucune synchro inutile (version', rev, ')')

// Mauvaise clé
const devC = device(false); const C = await makeDevice(devC)
await assert.rejects(C.join(core.uid().padEnd(43, 'x').slice(0, 43)), /clé|budget/i)
assert.equal(C.sync.enabled, false)
console.log('5. clé inconnue refusée, appareil non lié')

// Suppression du serveur
await B.deleteRemote()
await A.syncNow()
assert.equal(A.sync.status, 'missing')
await A.recreate()
assert.equal(A.sync.status, 'idle')
console.log('6. coffre supprimé détecté par A puis recréé, version', A.sync.rev)

srv.kill()
console.log('OK'); process.exit(0)
