#!/usr/bin/env node
/**
 * Serveur de synchronisation de Mon Budget — Node.js pur, aucune dépendance.
 *
 * Il ne stocke que des données CHIFFRÉES côté navigateur : il ne connaît ni la clé,
 * ni le contenu. Chaque « coffre » est un fichier JSON :
 *   { tokenHash, rev, iv, ct, updatedAt, createdAt }
 *
 * API (même origine que l'application, ou CORS via ALLOWED_ORIGINS) :
 *   GET    /api/health
 *   GET    /api/vaults/:id     Authorization: Bearer <token>   [If-None-Match: "<rev>"]
 *   PUT    /api/vaults/:id     Authorization: Bearer <token>   { iv, ct, baseRev }
 *            - création si le coffre n'existe pas (baseRev = 0) ;
 *            - 409 + version actuelle si baseRev ne correspond pas (modification concurrente).
 *   DELETE /api/vaults/:id     Authorization: Bearer <token>
 *
 * Il sert aussi l'application générée (npm run generate → .output/public).
 *
 * Variables d'environnement :
 *   PORT (3001)  HOST (0.0.0.0)  DATA_DIR (./data)  STATIC_DIR (./.output/public)
 *   MAX_BODY_MB (5)  RATE_LIMIT (240 requêtes / minute / IP)  TRUST_PROXY (0|1)
 *   ALLOWED_ORIGINS (ex. "https://budget.exemple.fr", vide = même origine seulement)
 *   TLS_CERT / TLS_KEY (chemins PEM pour servir directement en HTTPS)
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import { createReadStream, existsSync, readFileSync } from 'node:fs'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'

const env = process.env
const PORT = Number(env.PORT || 3001)
const HOST = env.HOST || '0.0.0.0'
const DATA_DIR = path.resolve(env.DATA_DIR || './data')
const STATIC_DIR = path.resolve(env.STATIC_DIR || './.output/public')
const MAX_BODY = Number(env.MAX_BODY_MB || 5) * 1024 * 1024
const RATE_LIMIT = Number(env.RATE_LIMIT || 240)
const TRUST_PROXY = env.TRUST_PROXY === '1'
const ALLOWED_ORIGINS = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)

const ID_RE = /^[a-f0-9]{32}$/
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/
const B64URL_RE = /^[A-Za-z0-9_-]+$/

/* ---------- Utilitaires ---------- */
const sha256 = s => createHash('sha256').update(s).digest()
const vaultFile = id => path.join(DATA_DIR, `${id}.json`)

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
}

function send(res, status, body, headers = {}) {
  const isJson = body !== undefined && typeof body !== 'string'
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    ...(isJson ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
    'Cache-Control': 'no-store',
    ...headers,
  })
  res.end(body === undefined ? undefined : isJson ? JSON.stringify(body) : body)
}

function clientIp(req) {
  if (TRUST_PROXY) {
    const xf = req.headers['x-forwarded-for']
    if (typeof xf === 'string' && xf) return xf.split(',')[0].trim()
  }
  return req.socket.remoteAddress || 'unknown'
}

/* Limitation simple du nombre de requêtes par IP (fenêtre d'une minute). */
const hits = new Map()
function rateLimited(ip) {
  const now = Date.now()
  const h = hits.get(ip)
  if (!h || now - h.start > 60_000) { hits.set(ip, { start: now, n: 1 }); return false }
  return ++h.n > RATE_LIMIT
}
setInterval(() => { const now = Date.now(); for (const [ip, h] of hits) if (now - h.start > 60_000) hits.delete(ip) }, 60_000).unref()

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY) { reject(Object.assign(new Error('too_large'), { status: 413 })); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function loadVault(id) {
  try { return JSON.parse(await readFile(vaultFile(id), 'utf8')) } catch (e) { if (e.code === 'ENOENT') return null; throw e }
}
async function saveVault(id, vault) {
  const file = vaultFile(id)
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, JSON.stringify(vault), { mode: 0o600 })
  await rename(tmp, file) // écriture atomique
}

/* Les écritures sur un même coffre sont traitées l'une après l'autre. */
const locks = new Map()
function withLock(id, fn) {
  const prev = locks.get(id) || Promise.resolve()
  const next = prev.then(fn, fn)
  locks.set(id, next.catch(() => {}))
  next.finally(() => { if (locks.get(id) === next) locks.delete(id) }).catch(() => {})
  return next
}

function bearer(req) {
  const h = req.headers.authorization || ''
  const m = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(h)
  return m ? m[1] : null
}
function tokenMatches(vault, token) {
  const expected = Buffer.from(vault.tokenHash, 'hex')
  const got = sha256(token)
  return expected.length === got.length && timingSafeEqual(expected, got)
}
const publicVault = v => ({ rev: v.rev, iv: v.iv, ct: v.ct, updatedAt: v.updatedAt })

/* ---------- API ---------- */
async function handleApi(req, res, url) {
  if (url.pathname === '/api/health') return send(res, 200, { ok: true })
  const m = /^\/api\/vaults\/([^/]+)$/.exec(url.pathname)
  if (!m) return send(res, 404, { error: 'not_found' })
  const id = m[1]
  if (!ID_RE.test(id)) return send(res, 400, { error: 'bad_id' })
  const token = bearer(req)
  if (!token || !TOKEN_RE.test(token)) return send(res, 401, { error: 'unauthorized' })

  if (req.method === 'GET') {
    const v = await loadVault(id)
    // Coffre absent ou mauvais jeton : même réponse, pour ne rien révéler.
    if (!v || !tokenMatches(v, token)) return send(res, 404, { error: 'not_found' })
    const etag = `"${v.rev}"`
    if (req.headers['if-none-match'] === etag) return send(res, 304, undefined, { ETag: etag })
    return send(res, 200, publicVault(v), { ETag: etag })
  }

  if (req.method === 'PUT') {
    let body
    try { body = JSON.parse(await readBody(req)) } catch (e) { return send(res, e.status || 400, { error: e.status ? 'too_large' : 'bad_json' }) }
    const { iv, ct, baseRev } = body || {}
    if (typeof iv !== 'string' || !B64URL_RE.test(iv) || iv.length !== 16
      || typeof ct !== 'string' || !B64URL_RE.test(ct) || ct.length < 22
      || !Number.isInteger(baseRev) || baseRev < 0) return send(res, 400, { error: 'bad_body' })
    return withLock(id, async () => {
      const v = await loadVault(id)
      const now = new Date().toISOString()
      if (!v) {
        if (baseRev !== 0) return send(res, 404, { error: 'not_found' })
        const created = { tokenHash: sha256(token).toString('hex'), rev: 1, iv, ct, createdAt: now, updatedAt: now }
        await saveVault(id, created)
        return send(res, 201, { rev: 1, updatedAt: now })
      }
      if (!tokenMatches(v, token)) return send(res, 404, { error: 'not_found' })
      if (baseRev !== v.rev) return send(res, 409, { error: 'conflict', ...publicVault(v) })
      const updated = { ...v, rev: v.rev + 1, iv, ct, updatedAt: now }
      await saveVault(id, updated)
      return send(res, 200, { rev: updated.rev, updatedAt: now })
    })
  }

  if (req.method === 'DELETE') {
    return withLock(id, async () => {
      const v = await loadVault(id)
      if (!v || !tokenMatches(v, token)) return send(res, 404, { error: 'not_found' })
      await rm(vaultFile(id), { force: true })
      return send(res, 204)
    })
  }

  return send(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, PUT, DELETE' })
}

/* ---------- Fichiers statiques (application générée) ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
}
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

async function serveStatic(req, res, url) {
  if (!existsSync(STATIC_DIR)) return send(res, 404, 'Application non générée : lancez « npm run generate ».', { 'Content-Type': 'text/plain; charset=utf-8' })
  let rel
  try { rel = decodeURIComponent(url.pathname) } catch { return send(res, 400, 'Bad request') }
  let file = path.join(STATIC_DIR, path.normalize(rel))
  if (!file.startsWith(STATIC_DIR)) return send(res, 403, 'Forbidden')
  let st = await stat(file).catch(() => null)
  if (st?.isDirectory()) { file = path.join(file, 'index.html'); st = await stat(file).catch(() => null) }
  if (!st) {
    // Application monopage : toute autre route renvoie la page d'entrée.
    for (const f of ['200.html', 'index.html']) {
      const p = path.join(STATIC_DIR, f)
      if (existsSync(p)) { file = p; st = await stat(p); break }
    }
    if (!st) return send(res, 404, 'Not found')
  }
  const ext = path.extname(file)
  const immutable = rel.startsWith('/_nuxt/')
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': st.size,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    ...(ext === '.html' ? { 'Content-Security-Policy': CSP } : {}),
  })
  if (req.method === 'HEAD') return res.end()
  createReadStream(file).pipe(res)
}

/* ---------- Serveur ---------- */
async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://local')
    const origin = req.headers.origin
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, If-None-Match')
      res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS')
      res.setHeader('Access-Control-Expose-Headers', 'ETag')
      if (req.method === 'OPTIONS') return send(res, 204)
    }
    if (url.pathname.startsWith('/api/')) {
      if (rateLimited(clientIp(req))) return send(res, 429, { error: 'rate_limited' }, { 'Retry-After': '60' })
      return await handleApi(req, res, url)
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed')
    return await serveStatic(req, res, url)
  } catch (e) {
    console.error(e)
    if (!res.headersSent) send(res, 500, { error: 'server_error' })
    else res.destroy()
  }
}

await mkdir(DATA_DIR, { recursive: true, mode: 0o700 })
const tls = env.TLS_CERT && env.TLS_KEY ? { cert: readFileSync(env.TLS_CERT), key: readFileSync(env.TLS_KEY) } : null
const server = tls ? https.createServer(tls, handler) : http.createServer(handler)
server.requestTimeout = 30_000
server.listen(PORT, HOST, () => {
  console.log(`Mon Budget — serveur de synchronisation sur ${tls ? 'https' : 'http'}://${HOST}:${PORT}`)
  console.log(`  coffres chiffrés : ${DATA_DIR}`)
  console.log(`  application      : ${existsSync(STATIC_DIR) ? STATIC_DIR : '(non générée — npm run generate)'}`)
})
const stop = () => server.close(() => process.exit(0))
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
