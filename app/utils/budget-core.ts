/**
 * Logique métier de Mon Budget : modèles, dates, montants, soldes, budget,
 * récurrences. Aucune dépendance (ni Vue, ni Nuxt) : testable avec `node --test`.
 * Toutes les fonctions qui lisent ou modifient des données reçoivent l'état `S`.
 */

/* =========================================================================
   Types
   ========================================================================= */
export type Kind = 'expense' | 'income'
export type TxType = 'expense' | 'income' | 'transfer'
export type AccountType = 'checking' | 'savings'
export type Frequency = 'weekly' | 'monthly'

export interface Wallet { id: string, name: string, initial: number, goal: number }
export interface Account { id: string, name: string, type: AccountType, initial: number, wallets: Wallet[] }
export interface Group { id: string, name: string, kind: Kind }
export interface Category { id: string, name: string, groupId: string }

/** Une ligne de répartition d'une opération (montant + budget + wallets). */
export interface Split {
  amount: number
  categoryId: string | null
  walletId: string | null
  toWalletId: string | null
}
export interface TxnFields {
  label: string
  amount: number
  type: TxType
  accountId: string
  walletId: string | null
  toAccountId: string | null
  toWalletId: string | null
  categoryId: string | null
  /** Répartition facultative (au moins 2 lignes, somme = amount). Absente = une seule ligne,
   *  décrite par categoryId / walletId / toWalletId (format historique, inchangé).
   *  Quand elle est présente, ces champs gardent la ligne principale : une ancienne version
   *  de l'app qui ignore `splits` reste cohérente (même montant, même compte). */
  splits?: Split[]
}
export interface Txn extends TxnFields { id: string, date: string, recurrenceId: string | null }
export interface Recurrence extends TxnFields {
  id: string
  frequency: Frequency
  start: string
  end: string | null
  generatedUntil: string | null
}

export interface BudgetState {
  accounts: Account[]
  groups: Group[]
  categories: Category[]
  recurrences: Recurrence[]
  /** mois "AAAA-MM" -> (catégorie -> montant prévu) */
  plans: Record<string, Record<string, number>>
  txns: Txn[]
  demo: boolean
}

/* =========================================================================
   Utilitaires
   ========================================================================= */
export const uid = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
export const round2 = (v: number): number => Math.round(v * 100) / 100
export const sumBy = <T>(arr: T[], k: keyof T): number => arr.reduce((s, x) => s + (Number(x[k]) || 0), 0)

const pad = (n: number): string => String(n).padStart(2, '0')
export const iso = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const parseDate = (s: string): Date => { const [y, m, d] = s.split('-').map(Number); return new Date(y!, m! - 1, d) }
export const today = (): string => iso(new Date())
export const mkey = (s: string): string => s.slice(0, 7)
export const monthDate = (mk: string): Date => { const [y, m] = mk.split('-').map(Number); return new Date(y!, m! - 1, 1) }
export const shiftMonth = (mk: string, n: number): string => { const d = monthDate(mk); return iso(new Date(d.getFullYear(), d.getMonth() + n, 1)).slice(0, 7) }
export const endOfMonth = (mk: string): string => { const d = monthDate(mk); return iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)) }
export const addDays = (s: string, n: number): string => { const d = parseDate(s); return iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)) }
export const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
export const isMonth = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}$/.test(s)

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
const fMoney = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
const fMonth = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })
const fMonthShort = new Intl.DateTimeFormat('fr-FR', { month: 'short' })
const fDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
const fShort = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const fWeekday = new Intl.DateTimeFormat('fr-FR', { weekday: 'long' })

export const money = (v: number): string => fMoney.format(round2(v) + 0)
export const signedMoney = (v: number): string => (round2(v) > 0 ? '+' : '') + money(v)
export const monthLabel = (mk: string): string => cap(fMonth.format(monthDate(mk)))
export const monthShort = (mk: string): string => fMonthShort.format(monthDate(mk)).replace('.', '')
export const dayLabel = (s: string): string => cap(fDay.format(parseDate(s)))
export const shortDate = (s: string): string => fShort.format(parseDate(s))
export const weekday = (s: string): string => fWeekday.format(parseDate(s))

/** "12,50", "1 200.3", "45 €" -> nombre ; null si invalide ou vide. */
export function parseAmount(s: unknown): number | null {
  const c = String(s ?? '').replace(/[\s  €]/g, '').replace(',', '.')
  if (!c) return null
  const n = Number(c)
  return Number.isFinite(n) ? n : null
}
export const amountText = (v: number): string => v ? String(round2(v)).replace('.', ',') : ''

/* =========================================================================
   État : création, normalisation, données de départ
   ========================================================================= */
export function emptyState(): BudgetState {
  return { accounts: [], groups: [], categories: [], recurrences: [], plans: {}, txns: [], demo: false }
}

export function seedStructure(s: BudgetState): void {
  s.accounts.push(
    { id: uid(), name: 'Compte courant', type: 'checking', initial: 0, wallets: [] },
    { id: uid(), name: 'Livret A', type: 'savings', initial: 0, wallets: [] },
  )
  const g = (name: string, kind: Kind, cats: string[]) => {
    const id = uid()
    s.groups.push({ id, name, kind })
    cats.forEach(c => s.categories.push({ id: uid(), name: c, groupId: id }))
  }
  g('Revenus', 'income', ['Salaire', 'Autres revenus'])
  g('Logement', 'expense', ['Loyer / crédit', 'Énergie', 'Internet & mobile'])
  g('Vie courante', 'expense', ['Courses', 'Restaurants', 'Santé'])
  g('Transport', 'expense', ['Carburant', 'Transports en commun'])
  g('Loisirs', 'expense', ['Sorties', 'Abonnements', 'Vacances'])
  g('Épargne', 'expense', ['Épargne mensuelle'])
}

/** Données d'exemple du mois en cours (signalées par un bandeau, effaçables). */
export function seedDemo(s: BudgetState): void {
  s.demo = true
  const c = (n: string) => s.categories.find(x => x.name === n)?.id ?? null
  const cc = s.accounts[0]!.id
  const L = s.accounts[1]
  s.accounts[0]!.initial = 1480
  let wTax: string | null = null
  let wVac: string | null = null
  if (L) {
    L.initial = 6200
    wTax = uid(); wVac = uid()
    L.wallets = [
      { id: wTax, name: 'Taxe foncière', initial: 600, goal: 1400 },
      { id: wVac, name: 'Vacances', initial: 1800, goal: 2500 },
      { id: uid(), name: 'Imprévus', initial: 2000, goal: 0 },
    ]
  }
  const mk = mkey(today())
  const d = (n: number) => `${mk}-${pad(n)}`
  const plan: Record<string, number> = { 'Salaire': 2650, 'Loyer / crédit': 890, 'Énergie': 95, 'Internet & mobile': 45,
    'Courses': 420, 'Restaurants': 120, 'Santé': 40, 'Carburant': 110, 'Sorties': 80, 'Abonnements': 35, 'Vacances': 150 }
  s.plans[mk] = {}
  for (const [n, a] of Object.entries(plan)) { const id = c(n); if (id) s.plans[mk]![id] = a }
  const R = (o: Partial<Recurrence> & Pick<Recurrence, 'start' | 'label' | 'amount' | 'type' | 'accountId'>) =>
    s.recurrences.push({ id: uid(), frequency: 'monthly', end: null, generatedUntil: null, toAccountId: null,
      categoryId: null, walletId: null, toWalletId: null, ...o })
  R({ start: d(1), label: 'Salaire', amount: 2650, type: 'income', accountId: cc, categoryId: c('Salaire') })
  R({ start: d(5), label: 'Loyer', amount: 890, type: 'expense', accountId: cc, categoryId: c('Loyer / crédit') })
  R({ start: d(20), label: 'EDF', amount: 92, type: 'expense', accountId: cc, categoryId: c('Énergie') })
  R({ start: d(15), label: 'Box internet', amount: 39.99, type: 'expense', accountId: cc, categoryId: c('Internet & mobile') })
  R({ start: d(18), label: 'Streaming vidéo', amount: 13.49, type: 'expense', accountId: cc, categoryId: c('Abonnements') })
  if (L) {
    R({ start: d(2), label: 'Épargne taxe foncière', amount: 300, type: 'transfer', accountId: cc, toAccountId: L.id, toWalletId: wTax })
    s.txns.push({ id: uid(), date: d(4), label: 'Acompte location été', amount: 400, type: 'transfer', accountId: L.id,
      walletId: wVac, toAccountId: cc, toWalletId: null, categoryId: null, recurrenceId: null })
  }
  const T = (day: number, label: string, amount: number, cat: string) => s.txns.push({ id: uid(), date: d(day), label, amount,
    type: 'expense', accountId: cc, walletId: null, toAccountId: null, toWalletId: null, categoryId: c(cat), recurrenceId: null })
  T(3, 'Supermarché', 86.4, 'Courses')
  T(6, 'Station-service', 68.3, 'Carburant')
  T(7, 'Pizzeria', 42, 'Restaurants')
  T(8, 'Pharmacie', 18.9, 'Santé')
  T(9, 'Supermarché', 112.75, 'Courses')
  // Exemple de répartition : une partie du ticket relève de la santé.
  const last = s.txns[s.txns.length - 1]!
  last.splits = [
    { amount: 92.75, categoryId: c('Courses'), walletId: null, toWalletId: null },
    { amount: 20, categoryId: c('Santé'), walletId: null, toWalletId: null },
  ]
  T(10, 'Cinéma', 24, 'Sorties')
  T(11, 'Boulangerie', 7.6, 'Courses')
}

/** Valide et complète des données venues du stockage ou d'un import. */
export function normalize(o: any): BudgetState {
  const s = emptyState()
  if (!o || typeof o !== 'object') return s
  const str = (v: unknown) => typeof v === 'string' ? v : ''
  const num = (v: unknown) => Number.isFinite(+(v as number)) ? +(v as number) : 0
  const opt = (v: unknown) => v ? str(v) || null : null
  const types: TxType[] = ['expense', 'income', 'transfer']
  const ttype = (v: unknown): TxType => types.includes(v as TxType) ? v as TxType : 'expense'

  s.accounts = (o.accounts || []).filter((a: any) => a && a.id).map((a: any): Account => {
    const type: AccountType = a.type === 'savings' || a.type === 'checking' ? a.type
      : /livret|épargne|epargne|ldd|pel|cel|assurance/i.test(str(a.name)) ? 'savings' : 'checking'
    const wallets = type === 'savings'
      ? (Array.isArray(a.wallets) ? a.wallets : []).filter((w: any) => w && w.id)
          .map((w: any) => ({ id: str(w.id), name: str(w.name) || 'Wallet', initial: num(w.initial), goal: Math.abs(num(w.goal)) }))
      : []
    return { id: str(a.id), name: str(a.name) || 'Compte', type, initial: num(a.initial), wallets }
  })
  s.groups = (o.groups || []).filter((g: any) => g && g.id)
    .map((g: any) => ({ id: str(g.id), name: str(g.name) || 'Groupe', kind: g.kind === 'income' ? 'income' : 'expense' }))
  s.categories = (o.categories || []).filter((c: any) => c && c.id)
    .map((c: any) => ({ id: str(c.id), name: str(c.name) || 'Catégorie', groupId: str(c.groupId) }))
  const fields = (x: any): TxnFields => {
    const f: TxnFields = {
      label: str(x.label), amount: Math.abs(num(x.amount)), type: ttype(x.type), accountId: str(x.accountId),
      walletId: opt(x.walletId), toAccountId: opt(x.toAccountId), toWalletId: opt(x.toWalletId), categoryId: opt(x.categoryId),
    }
    const splits = Array.isArray(x.splits)
      ? x.splits.filter((l: any) => l && typeof l === 'object' && num(l.amount))
          .map((l: any): Split => ({ amount: round2(Math.abs(num(l.amount))), categoryId: opt(l.categoryId), walletId: opt(l.walletId), toWalletId: opt(l.toWalletId) }))
      : []
    if (splits.length >= 2) {
      f.splits = splits
      f.amount = round2(splits.reduce((s: number, l: Split) => s + l.amount, 0)) // la somme des lignes fait foi
    }
    return f
  }
  s.recurrences = (o.recurrences || []).filter((r: any) => r && r.id && isDate(r.start)).map((r: any): Recurrence => ({
    id: str(r.id), frequency: r.frequency === 'weekly' ? 'weekly' : 'monthly', start: r.start,
    end: isDate(r.end) ? r.end : null, generatedUntil: isDate(r.generatedUntil) ? r.generatedUntil : null, ...fields(r),
  }))
  if (o.plans && typeof o.plans === 'object') {
    for (const [mk, m] of Object.entries(o.plans)) {
      if (!isMonth(mk) || !m || typeof m !== 'object') continue
      const out: Record<string, number> = {}
      for (const [k, v] of Object.entries(m as object)) if (num(v)) out[k] = num(v)
      if (Object.keys(out).length) s.plans[mk] = out
    }
  }
  s.txns = (o.txns || []).filter((t: any) => t && t.id && isDate(t.date)).map((t: any): Txn => ({
    id: str(t.id), date: t.date, recurrenceId: opt(t.recurrenceId), ...fields(t),
  }))
  s.demo = !!o.demo
  // Ordre canonique : deux appareils qui ont les mêmes données produisent exactement
  // le même JSON (indispensable pour savoir s'il reste quelque chose à synchroniser).
  s.txns.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  s.recurrences.sort((a, b) => a.id.localeCompare(b.id))
  s.plans = Object.fromEntries(Object.keys(s.plans).sort().map(mk =>
    [mk, Object.fromEntries(Object.entries(s.plans[mk]!).sort(([x], [y]) => x.localeCompare(y)))]))
  return s
}

/* =========================================================================
   Recherches
   ========================================================================= */
export const accountOf = (S: BudgetState, id: string | null | undefined) => S.accounts.find(a => a.id === id)
export const groupOf = (S: BudgetState, id: string | null | undefined) => S.groups.find(g => g.id === id)
export const categoryOf = (S: BudgetState, id: string | null | undefined) => id ? S.categories.find(c => c.id === id) : undefined
export const recurrenceOf = (S: BudgetState, id: string | null | undefined) => id ? S.recurrences.find(r => r.id === id) : undefined
export const categoriesOf = (S: BudgetState, gid: string) => S.categories.filter(c => c.groupId === gid)
export const groupsOfKind = (S: BudgetState, kind: Kind) => S.groups.filter(g => g.kind === kind)
export const kindOfCategory = (S: BudgetState, id: string | null | undefined): Kind | undefined => groupOf(S, categoryOf(S, id)?.groupId)?.kind
export function categoryPath(S: BudgetState, id: string | null | undefined): string | null {
  const c = categoryOf(S, id)
  return c ? `${groupOf(S, c.groupId)?.name ?? ''} › ${c.name}` : null
}
export const walletsOf = (S: BudgetState, aid: string | null | undefined) => accountOf(S, aid)?.wallets ?? []
export const walletOf = (S: BudgetState, aid: string | null | undefined, wid: string | null | undefined) =>
  wid ? walletsOf(S, aid).find(w => w.id === wid) : undefined
export const isSavings = (S: BudgetState, aid: string | null | undefined) => accountOf(S, aid)?.type === 'savings'
export const hasWallets = (S: BudgetState, aid: string | null | undefined) => isSavings(S, aid) && walletsOf(S, aid).length > 0

/* =========================================================================
   Soldes
   ========================================================================= */
export interface Flow { a: string | null, w: string | null, v: number }
/** Mouvements d'une opération : un côté (dépense, revenu) ou deux (virement). */
/** Lignes d'une opération : sa répartition, ou une seule ligne (format historique). */
export function linesOf(t: TxnFields): Split[] {
  return t.splits && t.splits.length >= 2
    ? t.splits
    : [{ amount: t.amount, categoryId: t.categoryId, walletId: t.walletId, toWalletId: t.toWalletId }]
}
/** Ligne principale (la plus grosse) : recopiée dans les champs historiques pour la compatibilité. */
export function mainLine(lines: Split[]): Split {
  return lines.reduce((m, l) => l.amount > m.amount ? l : m, lines[0]!)
}
export function flows(t: TxnFields): Flow[] {
  const out: Flow[] = []
  for (const l of linesOf(t)) {
    if (t.type === 'income') out.push({ a: t.accountId, w: l.walletId, v: l.amount })
    else if (t.type === 'expense') out.push({ a: t.accountId, w: l.walletId, v: -l.amount })
    else out.push({ a: t.accountId, w: l.walletId, v: -l.amount }, { a: t.toAccountId, w: l.toWalletId, v: l.amount })
  }
  return out
}
/** Solde d'un compte, opérations jusqu'à `upTo` incluse (toutes si absent). */
export function balance(S: BudgetState, aid: string, upTo?: string): number {
  let b = accountOf(S, aid)?.initial || 0
  for (const t of S.txns) {
    if (upTo && t.date > upTo) continue
    for (const f of flows(t)) if (f.a === aid) b += f.v
  }
  return b
}
/** Solde d'un wallet ; wid = null pour la part « non affectée » du compte. */
export function walletBalance(S: BudgetState, aid: string, wid: string | null, upTo?: string): number {
  const ws = walletsOf(S, aid)
  if (!wid) return balance(S, aid, upTo) - ws.reduce((s, w) => s + walletBalance(S, aid, w.id, upTo), 0)
  let b = ws.find(w => w.id === wid)?.initial || 0
  for (const t of S.txns) {
    if (upTo && t.date > upTo) continue
    for (const f of flows(t)) if (f.a === aid && f.w === wid) b += f.v
  }
  return b
}
/** Montant signé vu depuis un compte (et éventuellement un wallet ; null = non affecté). */
export function signedFor(t: Txn, accountId: string | null, wallet?: string | null): number {
  if (!accountId) return t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0
  return flows(t).filter(x => x.a === accountId && (wallet === undefined || (x.w || null) === wallet)).reduce((s, x) => s + x.v, 0)
}

/* =========================================================================
   Budget
   ========================================================================= */
export const txnsOfMonth = (S: BudgetState, mk: string) => S.txns.filter(t => mkey(t.date) === mk)
export const planned = (S: BudgetState, mk: string, cid: string) => S.plans[mk]?.[cid] || 0
export const hasPlan = (S: BudgetState, mk: string) => Object.keys(S.plans[mk] || {}).length > 0
export function setPlanned(S: BudgetState, mk: string, cid: string, v: number): void {
  const m = S.plans[mk] || (S.plans[mk] = {})
  if (v) m[cid] = round2(v); else delete m[cid]
  if (!Object.keys(m).length) delete S.plans[mk]
}

export interface Actual { done: number, up: number, total: number }
/** Réel d'une catégorie, séparé entre réalisé (jusqu'à aujourd'hui) et à venir.
 *  Une opération de sens inverse (ex. remboursement) vient en déduction. */
export function actualOf(S: BudgetState, list: Txn[], cid: string): Actual {
  const kind = kindOfCategory(S, cid)
  const td = today()
  let done = 0, up = 0
  for (const t of list) {
    for (const l of linesOf(t)) {
      if (l.categoryId !== cid) continue
      // Un virement affecté à un budget compte comme une dépense (ex. « Épargne mensuelle »).
      const outflow = t.type !== 'income'
      const same = kind === 'expense' ? outflow : !outflow
      const v = same ? l.amount : -l.amount
      if (t.date > td) up += v; else done += v
    }
  }
  return { done, up, total: done + up }
}
export interface Line extends Actual { c: Category, planned: number }
export interface GroupSummary { g: Group, lines: Line[], planned: number, done: number, up: number, total: number }
export function summary(S: BudgetState, mk: string, kind: Kind): GroupSummary[] {
  const list = txnsOfMonth(S, mk)
  return groupsOfKind(S, kind).map((g) => {
    const lines = categoriesOf(S, g.id).map(c => ({ c, planned: planned(S, mk, c.id), ...actualOf(S, list, c.id) }))
    return { g, lines, planned: sumBy(lines, 'planned'), done: sumBy(lines, 'done'), up: sumBy(lines, 'up'), total: sumBy(lines, 'total') }
  })
}
export function uncategorized(S: BudgetState, mk: string, type: 'expense' | 'income'): { total: number, up: number } {
  const td = today()
  let total = 0, up = 0
  for (const t of txnsOfMonth(S, mk)) {
    if (t.type !== type) continue
    for (const l of linesOf(t)) if (!l.categoryId) { total += l.amount; if (t.date > td) up += l.amount }
  }
  return { total, up }
}
export function plannedTotals(S: BudgetState, mk: string) {
  const tot = (kind: Kind) => groupsOfKind(S, kind).flatMap(g => categoriesOf(S, g.id)).reduce((s, c) => s + planned(S, mk, c.id), 0)
  const inc = tot('income'), exp = tot('expense')
  return { inc, exp, rest: inc - exp }
}

/** Supprime des catégories et efface leurs références (opérations, séries, budgets). */
export function forgetCategories(S: BudgetState, ids: string[]): void {
  const set = new Set(ids)
  for (const x of [...S.txns, ...S.recurrences]) {
    if (x.categoryId && set.has(x.categoryId)) x.categoryId = null
    for (const l of x.splits ?? []) if (l.categoryId && set.has(l.categoryId)) l.categoryId = null
  }
  for (const mk of Object.keys(S.plans)) {
    for (const id of set) delete S.plans[mk]![id]
    if (!Object.keys(S.plans[mk]!).length) delete S.plans[mk]
  }
  S.categories = S.categories.filter(c => !set.has(c.id))
}

/* =========================================================================
   Récurrences
   ========================================================================= */
/** Les séries sans fin sont générées jusqu'à la fin du 12e mois à venir. */
export const horizon = (): string => endOfMonth(shiftMonth(mkey(today()), 12))

/** Date de la n-ième échéance (n = 0 : la première). En mensuel, le jour est
 *  ramené au dernier jour du mois si besoin (31 → 30, 28…). */
export function occurrence(r: Pick<Recurrence, 'frequency' | 'start'>, n: number): string {
  const s = parseDate(r.start)
  if (r.frequency === 'weekly') return iso(new Date(s.getFullYear(), s.getMonth(), s.getDate() + 7 * n))
  const last = new Date(s.getFullYear(), s.getMonth() + n + 1, 0).getDate()
  return iso(new Date(s.getFullYear(), s.getMonth() + n, Math.min(s.getDate(), last)))
}
export function datesBetween(r: Pick<Recurrence, 'frequency' | 'start' | 'end'>, from: string, to: string): string[] {
  const limit = r.end && r.end < to ? r.end : to
  const out: string[] = []
  for (let n = 0; n < 5000; n++) {
    const d = occurrence(r, n)
    if (d > limit) break
    if (d >= from) out.push(d)
  }
  return out
}
/** Crée les échéances manquantes d'une série. Renvoie true si quelque chose a changé. */
export function generate(S: BudgetState, r: Recurrence): boolean {
  const h = horizon()
  const limit = r.end && r.end < h ? r.end : h
  const from = r.generatedUntil ? addDays(r.generatedUntil, 1) : r.start
  if (from > limit) return false
  for (const d of datesBetween(r, from, limit)) {
    // Identifiant déterministe : deux appareils synchronisés génèrent la même échéance
    // avec le même id (pas de doublon à la fusion).
    const id = `${r.id}@${d}`
    if (S.txns.some(t => t.id === id)) continue
    S.txns.push({ id, date: d, recurrenceId: r.id, label: r.label, amount: r.amount, type: r.type, accountId: r.accountId,
      walletId: r.walletId, toAccountId: r.toAccountId, toWalletId: r.toWalletId, categoryId: r.categoryId,
      ...(r.splits ? { splits: r.splits.map(l => ({ ...l })) } : {}) })
  }
  r.generatedUntil = limit
  return true
}
export const regenerateAll = (S: BudgetState): boolean => S.recurrences.reduce((ch, r) => generate(S, r) || ch, false)
export const occurrencesOf = (S: BudgetState, id: string) =>
  S.txns.filter(t => t.recurrenceId === id).sort((a, b) => a.date.localeCompare(b.date))

function dropSeriesIfEmpty(S: BudgetState, r: Recurrence): void {
  if (!S.txns.some(t => t.recurrenceId === r.id)) S.recurrences = S.recurrences.filter(x => x !== r)
}
/** Arrête la série à partir de l'échéance t (incluse) ; les précédentes restent. */
export function endSeriesFrom(S: BudgetState, t: Txn): void {
  const r = recurrenceOf(S, t.recurrenceId)
  const cut = t.date
  S.txns = S.txns.filter(x => !(x.recurrenceId === t.recurrenceId && x.date >= cut))
  if (r) { r.end = addDays(cut, -1); r.generatedUntil = r.end; dropSeriesIfEmpty(S, r) }
}
/** Arrête une série après aujourd'hui (les échéances passées restent). */
export function stopSeries(S: BudgetState, id: string): void {
  const r = recurrenceOf(S, id)
  if (!r) return
  const td = today()
  S.txns = S.txns.filter(x => !(x.recurrenceId === id && x.date > td))
  r.end = td; r.generatedUntil = td
  dropSeriesIfEmpty(S, r)
}
/** Supprime toute la série, échéances passées comprises. */
export function deleteSeries(S: BudgetState, id: string): void {
  S.txns = S.txns.filter(x => x.recurrenceId !== id)
  S.recurrences = S.recurrences.filter(r => r.id !== id)
}

/** Texte d'aperçu d'une règle de récurrence (formulaire de saisie). */
export function recurrencePreview(f: { frequency: Frequency, date: string, end: string }): { text: string, error: boolean } {
  if (!isDate(f.date)) return { text: '', error: false }
  const day = parseDate(f.date).getDate()
  const when = f.frequency === 'weekly' ? `Chaque ${weekday(f.date)}`
    : `Le ${day} de chaque mois${day > 28 ? ' (dernier jour pour les mois plus courts)' : ''}`
  if (!f.end) return { text: `${when}, sans date de fin. Les échéances sont créées 12 mois à l'avance puis prolongées automatiquement.`, error: false }
  const dates = datesBetween({ frequency: f.frequency, start: f.date, end: f.end }, f.date, f.end)
  if (!dates.length) return { text: 'La date de fin est avant la première échéance.', error: true }
  return { text: `${when} : ${dates.length} opération${dates.length > 1 ? 's' : ''}, du ${shortDate(dates[0]!)} au ${shortDate(dates[dates.length - 1]!)}.`, error: false }
}
