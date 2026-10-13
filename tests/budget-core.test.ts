// Tests de la logique métier — lancer avec : npm test  (Node 22.18+ : TypeScript natif)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  emptyState, seedStructure, seedDemo, normalize, balance, walletBalance, signedFor, summary, actualOf,
  txnsOfMonth, occurrence, datesBetween, generate, endSeriesFrom, stopSeries, deleteSeries, occurrencesOf,
  parseAmount, money, setPlanned, forgetCategories, mkey, today, type BudgetState, type Recurrence,
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
  assert.equal(Math.round(actualOf(s, txnsOfMonth(s, mk), courses.id).total * 100) / 100, 206.75)
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
