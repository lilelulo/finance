/**
 * Chiffrement de bout en bout (WebCrypto, aucune dépendance).
 *
 * Une clé maîtresse aléatoire de 256 bits est créée sur le premier appareil.
 * Elle n'est jamais envoyée au serveur. On en dérive (HKDF-SHA-256) :
 *   - vaultId : identifiant du coffre sur le serveur (128 bits, hexadécimal) ;
 *   - token   : jeton d'accès (256 bits) ; le serveur n'en garde que l'empreinte SHA-256 ;
 *   - aes     : clé AES-GCM 256 bits qui chiffre les données.
 * Le serveur ne voit donc que des octets chiffrés, un identifiant et un jeton,
 * sans pouvoir retrouver la clé de chiffrement.
 *
 * Attention : `crypto.subtle` n'existe que dans un contexte sécurisé
 * (HTTPS, ou http://localhost).
 */

const enc = new TextEncoder()
const dec = new TextDecoder()
const SALT = enc.encode('mon-budget/v1')

export interface VaultKeys { vaultId: string, token: string, aes: CryptoKey }
export interface CipherBox { iv: string, ct: string }

export function b64url(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
const hex = (b: Uint8Array) => [...b].map(x => x.toString(16).padStart(2, '0')).join('')

/** Vrai si le navigateur peut chiffrer (contexte sécurisé : HTTPS ou localhost). */
export const hasWebCrypto = (): boolean => !!globalThis.crypto?.subtle

/** Nouvelle clé maîtresse, encodée en base64url (43 caractères). */
export function generateMasterKey(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(new ArrayBuffer(32))))
}
export function isValidMasterKey(k: string): boolean {
  if (!/^[A-Za-z0-9_-]{43}$/.test(k)) return false
  try { return fromB64url(k).length === 32 } catch { return false }
}

export async function deriveKeys(master: string): Promise<VaultKeys> {
  if (!isValidMasterKey(master)) throw new Error('Clé invalide')
  const base = await crypto.subtle.importKey('raw', fromB64url(master), 'HKDF', false, ['deriveBits', 'deriveKey'])
  const params = (info: string) => ({ name: 'HKDF', hash: 'SHA-256', salt: SALT, info: enc.encode(info) })
  const bits = async (info: string, bytes: number) => new Uint8Array(await crypto.subtle.deriveBits(params(info), base, bytes * 8))
  const aes = await crypto.subtle.deriveKey(params('data-key'), base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  return { vaultId: hex(await bits('vault-id', 16)), token: b64url(await bits('auth-token', 32)), aes }
}

/** Chiffre une valeur JSON. L'identifiant du coffre est lié au chiffré (données associées). */
export async function encryptJson(keys: VaultKeys, data: unknown): Promise<CipherBox> {
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(keys.vaultId) }, keys.aes, enc.encode(JSON.stringify(data)))
  return { iv: b64url(iv), ct: b64url(new Uint8Array(ct)) }
}

/** Déchiffre ; lève une erreur si la clé est mauvaise ou si le chiffré a été modifié. */
export async function decryptJson<T = unknown>(keys: VaultKeys, box: CipherBox): Promise<T> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(box.iv), additionalData: enc.encode(keys.vaultId) }, keys.aes, fromB64url(box.ct))
  return JSON.parse(dec.decode(pt)) as T
}
