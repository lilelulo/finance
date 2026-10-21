// Tests de la logique métier — lancer avec : npm test  (Node 22.18+ : TypeScript natif)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  emptyState, seedStructure, seedDemo, normalize, balance, walletBalance, signedFor, summary, actualOf,
  txnsOfMonth, occurrence, datesBetween, generate, endSeriesFrom, stopSeries, deleteSeries, occurrencesOf,
  parseAmount, money, setPlanned, forgetCategories, mkey, today, uncategorized, linesOf, regenerateAll,
  type BudgetState, type Recurrence, type Txn,
} from '../app/utils/budget-core.ts'

const demo = (): BudgetState => { const s = emptyState(); seedStructure(s); seedDemo(s); s.recurrences.forEach(r => generate(s, r)); return s }

test('parseAmount accepte les formats français', () => {
  assert.equal(parseAmount('12,50'), 12.5)
  assert.equal(parseAmount('1 200.3 €'), 1200.3)
  assert.equal(parseAmount(''), null)
  assert.equal(parseAmount('abc'), null)
  assert.match(money(-0.001), /^0,00\s€$/)
})

test('échéances mensuelles ramenées au dernier jour du mois', () => {
  const r = { frequency: 'monthly' as const, start: '2026-01-31', end: null }
  assert.deepEqual([0, 1, 2, 3].map(n => occurrence(r, n)), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
  assert.equal(datesBetween({ ...r, end: '2026-06-15' }, '2026-01-01', '2030-01-01').length, 5)
  assert.deepEqual(datesBetween({ frequency: 'weekly', start: '2026-10-05', end: '2026-10-26' }, '2026-10-05', '2030-01-01'),
    ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'])
})

test('soldes des comptes et des wallets (données d\'exemple)', () => {
  const s = demo()
  const L = s.accounts[1]!
  const eom = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10) })()
  // Livret : 6200 + 300 (virement taxe foncière, le 2) - 400 (acompte vacances, le 4), si ces dates sont passées
  const total = balance(s, L.id, eom)
  const [tax, vac, imp] = L.wallets
  assert.equal(walletBalance(s, L.id, tax!.id, eom), 900)
  assert.equal(walletBalance(s, L.id, vac!.id, eom), 1400)
  assert.equal(walletBalance(s, L.id, imp!.id, eom), 2000)
  assert.equal(walletBalance(s, L.id, null, eom), total - 4300)
  assert.equal(total, 6100)
})

test('virement entre deux wallets du même compte : solde global inchangé', () => {
  const s = demo()
  const L = s.accounts[1]!
  const before = balance(s, L.id)
  s.txns.push({ id: 'x', date: today(), label: '', amount: 100, type: 'transfer', accountId: L.id, walletId: null,
    toAccountId: L.id, toWalletId: L.wallets[2]!.id, categoryId: null, recurrenceId: null })
  assert.equal(balance(s, L.id), before)
  assert.equal(signedFor(s.txns.at(-1)!, L.id), 0)
  assert.equal(signedFor(s.txns.at(-1)!, L.id, L.wallets[2]!.id), 100)
  assert.equal(signedFor(s.txns.at(-1)!, L.id, null), -100)
})

test('supprimer une opération met à jour le solde', () => {
  const s = demo()
  const cc = s.accounts[0]!.id
  const t = s.txns.find(x => x.label === 'Boulangerie')!
  const before = balance(s, cc)
  s.txns = s.txns.filter(x => x !== t)
  assert.equal(Math.round((balance(s, cc) - before) * 100) / 100, 7.6)
})

test('récurrences : arrêter, couper, supprimer', () => {
  const s = demo()
  const r = s.recurrences.find(x => x.label === 'Loyer') as Recurrence
  const n = occurrencesOf(s, r.id).length
  assert.ok(n >= 12)
  const third = occurrencesOf(s, r.id)[2]!
  endSeriesFrom(s, third)
  assert.equal(occurrencesOf(s, r.id).length, 2)
  assert.ok(r.end! < third.date)
  assert.equal(generate(s, r), false, 'une série coupée ne se régénère pas')
  const edf = s.recurrences.find(x => x.label === 'EDF')!
  stopSeries(s, edf.id)
  assert.ok(occurrencesOf(s, edf.id).every(t => t.date <= today()))
  const box = s.recurrences.find(x => x.label === 'Box internet')!
  deleteSeries(s, box.id)
  assert.equal(occurrencesOf(s, box.id).length, 0)
  assert.ok(!s.recurrences.includes(box))
})

test('synthèse : prévu, réel, à venir', () => {
  const s = demo()
  const mk = mkey(today())
  const exp = summary(s, mk, 'expense')
  const logement = exp.find(g => g.g.name === 'Logement')!
  assert.equal(logement.planned, 1030)
  assert.equal(Math.round(logement.total * 100) / 100, 1021.99)
  const courses = s.categories.find(c => c.name === 'Courses')!
  assert.equal(Math.round(actualOf(s, txnsOfMonth(s, mk), courses.id).total * 100) / 100, 186.75) // ticket réparti : 20 € en Santé
  const sante = s.categories.find(c => c.name === 'Santé')!
  assert.equal(Math.round(actualOf(s, txnsOfMonth(s, mk), sante.id).total * 100) / 100, 38.9)
})

test('budget et suppression de catégorie', () => {
  const s = demo()
  const mk = '2030-01'
  const c = s.categories[3]!
  setPlanned(s, mk, c.id, 50)
  assert.equal(s.plans[mk]![c.id], 50)
  setPlanned(s, mk, c.id, 0)
  assert.equal(s.plans[mk], undefined)
  const courses = s.categories.find(x => x.name === 'Courses')!
  forgetCategories(s, [courses.id])
  assert.ok(s.txns.every(t => t.categoryId !== courses.id))
})

test('normalize : anciennes données sans type de compte ni wallet', () => {
  const s = normalize({ accounts: [{ id: 'a', name: 'Livret A', initial: 10 }, { id: 'b', name: 'Compte joint' }],
    txns: [{ id: 't', date: '2026-01-01', amount: '-5', type: 'expense', accountId: 'b' }], plans: { '2026-01': { x: 0, y: 3 } } })
  assert.equal(s.accounts[0]!.type, 'savings')
  assert.equal(s.accounts[1]!.type, 'checking')
  assert.deepEqual(s.accounts[0]!.wallets, [])
  assert.equal(s.txns[0]!.amount, 5)
  assert.equal(s.txns[0]!.walletId, null)
  assert.deepEqual(s.plans, { '2026-01': { y: 3 } })
})

/* ---------- Répartition sur plusieurs budgets / wallets ---------- */
const base = (s: BudgetState, o: Partial<Txn>): Txn => ({ id: 'x' + Math.random(), date: today(), recurrenceId: null, label: '', amount: 0,
  type: 'expense', accountId: s.accounts[0]!.id, walletId: null, toAccountId: null, toWalletId: null, categoryId: null, ...o })

test('dépense répartie : chaque catégorie reçoit sa part, le compte le total', () => {
  const s = emptyState(); seedStructure(s)
  const cc = s.accounts[0]!.id
  const cat = (n: string) => s.categories.find(c => c.name === n)!.id
  const before = balance(s, cc)
  s.txns.push(base(s, { amount: 100, categoryId: cat('Courses'), splits: [
    { amount: 60, categoryId: cat('Courses'), walletId: null, toWalletId: null },
    { amount: 25, categoryId: cat('Restaurants'), walletId: null, toWalletId: null },
    { amount: 15, categoryId: null, walletId: null, toWalletId: null },
  ] }))
  const mk = mkey(today()), list = txnsOfMonth(s, mk)
  assert.equal(actualOf(s, list, cat('Courses')).total, 60)
  assert.equal(actualOf(s, list, cat('Restaurants')).total, 25)
  assert.equal(uncategorized(s, mk, 'expense').total, 15)
  assert.equal(balance(s, cc), before - 100)
})

test('virement réparti sur plusieurs wallets, et part budgétée', () => {
  const s = emptyState(); seedStructure(s)
  const cc = s.accounts[0]!.id, L = s.accounts[1]!
  L.wallets = [{ id: 'tax', name: 'Taxe foncière', initial: 0, goal: 0 }, { id: 'vac', name: 'Vacances', initial: 0, goal: 0 }]
  const epargne = s.categories.find(c => c.name === 'Épargne mensuelle')!.id
  s.txns.push(base(s, { type: 'transfer', amount: 500, toAccountId: L.id, toWalletId: 'tax', splits: [
    { amount: 300, categoryId: epargne, walletId: null, toWalletId: 'tax' },
    { amount: 200, categoryId: null, walletId: null, toWalletId: 'vac' },
  ] }))
  assert.equal(walletBalance(s, L.id, 'tax'), 300)
  assert.equal(walletBalance(s, L.id, 'vac'), 200)
  assert.equal(walletBalance(s, L.id, null), 0)
  assert.equal(balance(s, L.id), 500)
  assert.equal(balance(s, cc), -500)
  assert.equal(actualOf(s, txnsOfMonth(s, mkey(today())), epargne).total, 300) // virement budgété = dépense
  assert.equal(uncategorized(s, mkey(today()), 'expense').total, 0) // les virements ne sont jamais « sans budget »
  // Virement entre deux wallets du même compte, réparti depuis deux wallets
  s.txns.push(base(s, { type: 'transfer', amount: 150, accountId: L.id, toAccountId: L.id, splits: [
    { amount: 100, categoryId: null, walletId: 'tax', toWalletId: null },
    { amount: 50, categoryId: null, walletId: 'vac', toWalletId: null },
  ] }))
  assert.equal(walletBalance(s, L.id, 'tax'), 200)
  assert.equal(walletBalance(s, L.id, 'vac'), 150)
  assert.equal(walletBalance(s, L.id, null), 150)
  assert.equal(balance(s, L.id), 500)
})

test('JSON : compatibilité avec le format actuel', () => {
  // Ancien format (sans splits) : relu à l'identique, aucun champ ajouté.
  const old = { id: 't', date: '2026-01-05', recurrenceId: null, label: 'A', amount: 10, type: 'expense', accountId: 'a', walletId: null, toAccountId: null, toWalletId: null, categoryId: 'c' }
  const s1 = normalize({ accounts: [{ id: 'a', name: 'CC' }], txns: [old] })
  assert.deepEqual(s1.txns[0], old)
  assert.ok(!('splits' in s1.txns[0]!))
  // Répartition d'une seule ligne ou vide : ignorée.
  const s2 = normalize({ txns: [{ ...old, splits: [{ amount: 10, categoryId: 'c' }] }, { ...old, id: 'u', splits: 'x' }] })
  assert.ok(s2.txns.every(t => !t.splits))
  // Répartition valide : conservée, montant = somme des lignes, champs historiques intacts.
  const s3 = normalize({ txns: [{ ...old, amount: 99, splits: [{ amount: '6', categoryId: 'c' }, { amount: 4.004, categoryId: 'd', walletId: 'w' }] }] })
  const t = s3.txns[0]!
  assert.equal(t.amount, 10)
  assert.deepEqual(t.splits, [{ amount: 6, categoryId: 'c', walletId: null, toWalletId: null }, { amount: 4, categoryId: 'd', walletId: 'w', toWalletId: null }])
  assert.equal(t.categoryId, 'c')
  assert.equal(linesOf(t).length, 2)
  // Aller-retour JSON stable (indispensable pour la synchro).
  assert.equal(JSON.stringify(normalize(JSON.parse(JSON.stringify(s3)))), JSON.stringify(s3))
})

test('série récurrente répartie : chaque échéance garde sa répartition', () => {
  const s = emptyState(); seedStructure(s)
  const cat = (n: string) => s.categories.find(c => c.name === n)!.id
  s.recurrences.push({ id: 'r', frequency: 'monthly', start: today(), end: null, generatedUntil: null, label: 'Assurance', amount: 80,
    type: 'expense', accountId: s.accounts[0]!.id, walletId: null, toAccountId: null, toWalletId: null, categoryId: cat('Santé'),
    splits: [{ amount: 50, categoryId: cat('Santé'), walletId: null, toWalletId: null }, { amount: 30, categoryId: cat('Carburant'), walletId: null, toWalletId: null }] })
  regenerateAll(s)
  const occ = s.txns.filter(t => t.recurrenceId === 'r')
  assert.ok(occ.length >= 12)
  assert.ok(occ.every(t => t.splits?.length === 2))
  occ[0]!.splits![0]!.amount = 1 // copies indépendantes
  assert.equal(occ[1]!.splits![0]!.amount, 50)
  forgetCategories(s, [cat('Carburant')])
  assert.ok(occ.every(t => t.splits![1]!.categoryId === null))
})
