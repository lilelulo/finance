// Tests du chiffrement et de la fusion — npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveKeys, encryptJson, decryptJson, generateMasterKey, isValidMasterKey, fromB64url } from '../app/utils/sync-crypto.ts'
import { mergeStates, mergeById } from '../app/utils/merge.ts'
import { emptyState, seedStructure, seedDemo, generate, normalize, type BudgetState } from '../app/utils/budget-core.ts'

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x))

test('clé maîtresse : 256 bits, dérivations stables et distinctes', async () => {
  const k = generateMasterKey()
  assert.ok(isValidMasterKey(k))
  assert.equal(fromB64url(k).length, 32)
  assert.ok(!isValidMasterKey(k.slice(1)))
  const a = await deriveKeys(k), b = await deriveKeys(k)
  assert.equal(a.vaultId, b.vaultId)
  assert.equal(a.token, b.token)
  assert.match(a.vaultId, /^[a-f0-9]{32}$/)
  assert.match(a.token, /^[A-Za-z0-9_-]{43}$/)
  const other = await deriveKeys(generateMasterKey())
  assert.notEqual(other.vaultId, a.vaultId)
})

test('chiffrement AES-GCM : aller-retour, mauvaise clé et altération refusées', async () => {
  const keys = await deriveKeys(generateMasterKey())
  const data = { hello: 'été €', n: [1, 2, 3] }
  const box = await encryptJson(keys, data)
  assert.ok(!box.ct.includes('hello'))
  assert.deepEqual(await decryptJson(keys, box), data)
  const wrong = await deriveKeys(generateMasterKey())
  await assert.rejects(decryptJson(wrong, box))
  const tampered = { ...box, ct: (box.ct[0] === 'A' ? 'B' : 'A') + box.ct.slice(1) }
  await assert.rejects(decryptJson(keys, tampered))
  // Le chiffré est lié à l'identifiant du coffre.
  await assert.rejects(decryptJson({ ...keys, vaultId: wrong.vaultId }, box))
})

test('fusion par identifiant : ajouts, modifications, suppressions des deux côtés', () => {
  const base = [{ id: 'a', v: 1 }, { id: 'b', v: 1 }, { id: 'c', v: 1 }, { id: 'd', v: 1 }]
  const local = [{ id: 'a', v: 2 }, { id: 'b', v: 1 }, { id: 'd', v: 5 }, { id: 'x', v: 1 }] // a modifié, c supprimé, d modifié, x ajouté
  const remote = [{ id: 'a', v: 1 }, { id: 'b', v: 3 }, { id: 'c', v: 1 }, { id: 'y', v: 1 }] // b modifié, d supprimé, y ajouté
  const m = Object.fromEntries(mergeById(base, local, remote).map(x => [x.id, x.v]))
  assert.deepEqual(m, { a: 2, b: 3, d: 5, x: 1, y: 1 })
  // Conflit (modifié des deux côtés) : l'appareil local l'emporte.
  assert.deepEqual(mergeById([{ id: 'a', v: 1 }], [{ id: 'a', v: 2 }], [{ id: 'a', v: 3 }]), [{ id: 'a', v: 2 }])
})

test('fusion de deux budgets modifiés en parallèle', () => {
  const s = emptyState(); seedStructure(s); seedDemo(s); s.recurrences.forEach(r => generate(s, r))
  const base = normalize(clone(s))
  const phone = normalize(clone(base)), laptop = normalize(clone(base))
  // Téléphone : nouvelle dépense + budget courses modifié
  phone.txns.push({ id: 'p1', date: '2026-10-12', label: 'Café', amount: 3, type: 'expense', accountId: phone.accounts[0]!.id,
    walletId: null, toAccountId: null, toWalletId: null, categoryId: null, recurrenceId: null })
  const mk = Object.keys(base.plans)[0]!
  const courses = phone.categories.find(c => c.name === 'Courses')!.id
  phone.plans[mk]![courses] = 500
  // Ordinateur : suppression d'une opération + nouveau wallet
  const boul = laptop.txns.find(t => t.label === 'Boulangerie')!.id
  laptop.txns = laptop.txns.filter(t => t.id !== boul)
  laptop.accounts[1]!.wallets.push({ id: 'w-new', name: 'Voiture', initial: 0, goal: 3000 })
  const merged = mergeStates(base, normalize(phone), normalize(laptop))
  assert.ok(merged.txns.some(t => t.id === 'p1'))
  assert.ok(!merged.txns.some(t => t.id === boul))
  assert.equal(merged.plans[mk]![courses], 500)
  assert.ok(merged.accounts[1]!.wallets.some(w => w.name === 'Voiture'))
})

test('échéances récurrentes : mêmes identifiants sur deux appareils (pas de doublon)', () => {
  const a = emptyState(); seedStructure(a); seedDemo(a)
  const b = normalize(clone(a))
  a.recurrences.forEach(r => generate(a, r)); b.recurrences.forEach(r => generate(b, r))
  const base: BudgetState = normalize(clone(a)); base.txns = base.txns.filter(t => !t.recurrenceId)
  const merged = mergeStates(base, normalize(a), b)
  assert.equal(merged.txns.length, a.txns.length)
})
