import { reactive, readonly } from 'vue'
import { normalize } from '~/utils/budget-core'
import type { BudgetState } from '~/utils/budget-core'
import { mergeStates } from '~/utils/merge'
import { decryptJson, deriveKeys, encryptJson, generateMasterKey, hasWebCrypto, isValidMasterKey } from '~/utils/sync-crypto'
import type { CipherBox, VaultKeys } from '~/utils/sync-crypto'

/* Synchronisation chiffrée de bout en bout entre appareils.
 *
 * - La clé maîtresse reste sur les appareils (localStorage) ; le serveur ne reçoit
 *   que le chiffré, l'identifiant du coffre et un jeton dérivés de cette clé.
 * - Cycle : récupérer la version du serveur (si elle a changé), la fusionner avec
 *   les modifications locales (fusion à trois voies depuis la dernière version commune),
 *   puis envoyer le résultat avec le numéro de version attendu. En cas de conflit (409),
 *   on refusionne et on recommence.
 */

const LS_SYNC = 'mon-budget-sync-v1'
export type SyncStatus = 'off' | 'idle' | 'syncing' | 'offline' | 'error' | 'missing'

const state = reactive({
  enabled: false,
  status: 'off' as SyncStatus,
  error: '',
  lastSync: null as string | null,
  rev: 0,
  joining: false,
})
let master: string | null = null
let keys: VaultKeys | null = null
let baseState: BudgetState | null = null
let apiBase = ''
let busy = false
let again = false
let timer: ReturnType<typeof setTimeout> | undefined
let started = false

const canonical = (s: BudgetState): BudgetState => normalize(JSON.parse(JSON.stringify(s)))
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function persist() {
  try {
    if (!master) localStorage.removeItem(LS_SYNC)
    else localStorage.setItem(LS_SYNC, JSON.stringify({ key: master, rev: state.rev, base: baseState, lastSync: state.lastSync, joining: state.joining }))
  } catch { /* stockage indisponible */ }
}

class HttpError extends Error {
  status: number
  constructor(status: number) { super(`HTTP ${status}`); this.status = status }
}

export function useSync() {
  const { S, replaceState } = useBudget()

  const url = () => `${apiBase.replace(/\/$/, '')}/api/vaults/${keys!.vaultId}`
  const auth = (): Record<string, string> => ({ Authorization: `Bearer ${keys!.token}` })

  async function integrate(v: CipherBox & { rev: number }) {
    let remote: BudgetState
    try { remote = normalize(await decryptJson(keys!, v)) }
    catch { throw new Error('Impossible de déchiffrer les données du serveur avec la clé de cet appareil.') }
    const local = canonical(S)
    // Nouvel appareil (pas de version commune) : il adopte le budget du serveur.
    const merged = baseState ? mergeStates(baseState, local, remote) : remote
    // Copie : l'état de l'application ne doit partager aucun objet avec la version commune
    // (sinon une modification dans un objet existant serait invisible pour la synchro).
    if (!sameJson(merged, local)) replaceState(JSON.parse(JSON.stringify(merged)))
    baseState = remote
    state.rev = v.rev
    state.joining = false
  }

  async function syncNow(): Promise<void> {
    if (!keys) return
    if (busy) { again = true; return }
    busy = true
    state.status = 'syncing'
    state.error = ''
    try {
      for (let round = 0; round < 5; round++) {
        // 1. Récupérer la version du serveur si elle a changé.
        const headers = auth()
        if (state.rev && baseState) headers['If-None-Match'] = `"${state.rev}"`
        const r = await fetch(url(), { headers, cache: 'no-store' })
        if (r.status === 200) await integrate(await r.json())
        else if (r.status === 404) {
          if (state.joining) throw new Error('Aucun budget synchronisé ne correspond à cette clé.')
          if (state.rev > 0) { state.status = 'missing'; return }
        }
        else if (r.status !== 304) throw new HttpError(r.status)

        // 2. Envoyer les modifications locales, s'il y en a.
        const local = canonical(S)
        if (state.rev > 0 && baseState && sameJson(local, baseState)) break
        const box = await encryptJson(keys, local)
        const p = await fetch(url(), {
          method: 'PUT',
          headers: { ...auth(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...box, baseRev: state.rev }),
        })
        if (p.status === 200 || p.status === 201) { state.rev = (await p.json()).rev; baseState = local; break }
        if (p.status === 409) { await integrate(await p.json()); continue }
        throw new HttpError(p.status)
      }
      state.lastSync = new Date().toISOString()
      state.status = 'idle'
    }
    catch (e) {
      const offline = e instanceof TypeError || (typeof navigator !== 'undefined' && navigator.onLine === false)
      state.status = offline ? 'offline' : 'error'
      state.error = offline ? 'Serveur injoignable : les modifications seront envoyées au retour de la connexion.'
        : e instanceof HttpError ? (e.status === 413 ? 'Budget trop volumineux pour le serveur.' : e.status === 429 ? 'Trop de requêtes, nouvel essai dans une minute.' : `Erreur du serveur (${e.status}).`)
        : (e as Error).message
      if (state.joining) throw e
    }
    finally {
      busy = false
      persist()
      if (again) { again = false; schedule(300) }
    }
  }

  function schedule(delay = 1500) {
    if (!keys) return
    clearTimeout(timer)
    timer = setTimeout(() => { void syncNow() }, delay)
  }

  async function useKey(key: string, joining: boolean) {
    master = key
    keys = await deriveKeys(key)
    state.enabled = true
    state.rev = 0
    state.joining = joining
    baseState = null
    persist()
  }

  /** Active la synchronisation sur ce premier appareil (crée le coffre chiffré). */
  async function enable() {
    if (!hasWebCrypto()) throw new Error('Le chiffrement nécessite une connexion sécurisée (HTTPS).')
    await useKey(generateMasterKey(), false)
    await syncNow()
  }

  /** Lie cet appareil à un budget existant ; ses données locales sont remplacées. */
  async function join(key: string) {
    if (!hasWebCrypto()) throw new Error('Le chiffrement nécessite une connexion sécurisée (HTTPS).')
    if (!isValidMasterKey(key)) throw new Error("Cette clé n'est pas valide.")
    await useKey(key, true)
    try { await syncNow() }
    catch (e) { disconnect(); throw e }
  }

  /** Oublie la clé sur cet appareil (les données locales restent). */
  function disconnect() {
    clearTimeout(timer)
    master = null; keys = null; baseState = null
    Object.assign(state, { enabled: false, status: 'off', error: '', lastSync: null, rev: 0, joining: false })
    persist()
  }

  /** Supprime le coffre chiffré du serveur puis déconnecte cet appareil. */
  async function deleteRemote() {
    if (!keys) return
    const r = await fetch(url(), { method: 'DELETE', headers: auth() })
    if (r.status !== 204 && r.status !== 404) throw new HttpError(r.status)
    disconnect()
  }

  /** Le coffre a disparu du serveur : le recréer avec les données de cet appareil. */
  async function recreate() {
    state.rev = 0
    baseState = null
    await syncNow()
  }

  /** Démarrage (appelé une fois par le plugin). */
  async function start(base: string) {
    if (started) return
    started = true
    apiBase = base
    try {
      const saved = JSON.parse(localStorage.getItem(LS_SYNC) || 'null')
      if (saved?.key && isValidMasterKey(saved.key) && hasWebCrypto()) {
        master = saved.key
        keys = await deriveKeys(saved.key)
        baseState = saved.base ? normalize(saved.base) : null
        Object.assign(state, { enabled: true, status: 'idle', rev: Number(saved.rev) || 0, lastSync: saved.lastSync || null, joining: !!saved.joining })
        void syncNow()
      }
      else if (saved?.key) {
        master = saved.key
        Object.assign(state, { enabled: true, status: 'error', error: 'Le chiffrement nécessite une connexion sécurisée (HTTPS) : synchronisation suspendue sur cette adresse.' })
      }
    }
    catch { /* pas de synchronisation */ }
    // Toujours à jour : au retour sur l'onglet, au retour du réseau, et toutes les 30 s.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(0) })
    window.addEventListener('online', () => schedule(0))
    setInterval(() => { if (document.visibilityState === 'visible') schedule(0) }, 30_000)
  }

  const shareUrl = () => master ? `${location.origin}/lier#cle=${master}` : ''

  return {
    sync: readonly(state),
    masterKey: () => master,
    hasWebCrypto,
    shareUrl,
    start, schedule, syncNow, enable, join, disconnect, deleteRemote, recreate,
  }
}
