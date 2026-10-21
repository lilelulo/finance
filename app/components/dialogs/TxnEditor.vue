<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import {
  amountText, datesBetween, endSeriesFrom, deleteSeries, flows, generate, isDate, mainLine, mkey, money, parseAmount,
  recurrencePreview, round2, shortDate, today, uid,
} from '~/utils/budget-core'
import type { Frequency, Recurrence, Split, Txn, TxnFields, TxType } from '~/utils/budget-core'

/* Saisie / modification d'une opération : récurrence, wallets, et répartition
   éventuelle sur plusieurs lignes (budgets et wallets). */
interface LineForm { key: string, amount: string, categoryId: string, walletId: string, toWalletId: string }
const props = defineProps<{ txnId: string | null }>()
const emit = defineEmits<{ close: [] }>()

const B = useBudget()
const { month, accFilter, walletFilter } = useUi()
const { open } = useDialogs()
const { ask, confirmDanger } = useChoice()
const { toast } = useToast()

const old: Txn | undefined = props.txnId ? B.S.txns.find(x => x.id === props.txnId) : undefined
const series: Recurrence | undefined = old ? B.rec(old.recurrenceId) : undefined
const td = today()

const f = reactive({
  type: (old?.type || 'expense') as TxType,
  amount: old ? amountText(old.amount) : '',
  label: old?.label || '',
  date: old?.date || (mkey(td) === month.value ? td : `${month.value}-01`),
  accountId: old?.accountId || accFilter.value || B.S.accounts[0]?.id || '',
  walletId: old?.walletId || (old ? '' : (walletFilter.value || '')),
  toAccountId: old?.toAccountId || '',
  toWalletId: old?.toWalletId || '',
  categoryId: old?.categoryId || '',
  recurring: !!series,
  frequency: (series?.frequency || 'monthly') as Frequency,
  end: series?.end || '',
  split: !!old?.splits?.length,
  lines: (old?.splits ?? []).map((l): LineForm => ({ key: uid(), amount: amountText(l.amount), categoryId: l.categoryId || '', walletId: l.walletId || '', toWalletId: l.toWalletId || '' })),
})
if (!B.acc(f.accountId)) f.accountId = B.S.accounts[0]?.id || ''
const err = ref('')

onMounted(() => {
  if (props.txnId && !old) { toast("Cette opération n'existe plus."); emit('close') }
})

const kind = computed(() => f.type === 'income' ? 'income' : 'expense')
const accLabel = computed(() => ({ expense: 'Payé depuis le compte', income: "L'argent arrive sur", transfer: 'Depuis le compte' })[f.type])
const checking = computed(() => B.S.accounts.filter(a => a.type !== 'savings'))
const savings = computed(() => B.S.accounts.filter(a => a.type === 'savings'))
const toAccounts = computed(() => B.S.accounts.filter(a => a.id !== f.accountId || B.hasWallets(a.id)))
const preview = computed(() => f.recurring ? recurrencePreview(f) : null)
const freqs: { v: Frequency, label: string }[] = [{ v: 'weekly', label: 'Chaque semaine' }, { v: 'monthly', label: 'Chaque mois' }]
const types: { v: TxType, label: string, icon: string }[] = [
  { v: 'expense', label: 'Dépense', icon: 'out' }, { v: 'income', label: 'Revenu', icon: 'in' }, { v: 'transfer', label: 'Virement', icon: 'swap' },
]

// Catégories proposées : revenus pour un revenu ; dépenses pour une dépense ou un virement
// (un virement peut être compté dans un budget, ex. « Épargne mensuelle »).
const catOk = (c: string) => !c || B.kindOfCat(c) === kind.value
watch(() => f.type, () => {
  if (!catOk(f.categoryId)) f.categoryId = ''
  for (const l of f.lines) if (!catOk(l.categoryId)) l.categoryId = ''
})
watch(() => f.accountId, () => {
  if (!B.walletOf(f.accountId, f.walletId)) f.walletId = ''
  for (const l of f.lines) if (!B.walletOf(f.accountId, l.walletId)) l.walletId = ''
  if (f.toAccountId === f.accountId && !B.hasWallets(f.accountId)) f.toAccountId = ''
})
watch(() => f.toAccountId, () => {
  if (!B.walletOf(f.toAccountId, f.toWalletId)) f.toWalletId = ''
  for (const l of f.lines) if (!B.walletOf(f.toAccountId, l.toWalletId)) l.toWalletId = ''
})

/* ---------- Répartition ---------- */
const fromWallets = computed(() => B.hasWallets(f.accountId))
const toWallets = computed(() => f.type === 'transfer' && B.hasWallets(f.toAccountId))
const lineSum = computed(() => round2(f.lines.reduce((s, l) => s + (parseAmount(l.amount) || 0), 0)))
const remaining = computed(() => round2((parseAmount(f.amount) || 0) - lineSum.value))
const newLine = (o: Partial<LineForm> = {}): LineForm => ({ key: uid(), amount: '', categoryId: '', walletId: '', toWalletId: '', ...o })
const splitLabel = computed(() => f.type === 'transfer'
  ? (toWallets.value || fromWallets.value ? 'Répartir sur plusieurs wallets ou budgets' : 'Répartir sur plusieurs budgets')
  : 'Répartir sur plusieurs budgets')

function startSplit() {
  f.lines = [
    newLine({ amount: f.amount, categoryId: f.categoryId, walletId: f.walletId, toWalletId: f.toWalletId }),
    newLine({ walletId: f.walletId }),
  ]
  f.split = true
  focusLine(1)
}
function stopSplit() {
  const filled = f.lines.filter(l => parseAmount(l.amount))
  const main = filled.reduce<LineForm | undefined>((m, l) => !m || (parseAmount(l.amount) || 0) > (parseAmount(m.amount) || 0) ? l : m, undefined)
  if (main) Object.assign(f, { categoryId: main.categoryId, walletId: main.walletId, toWalletId: main.toWalletId })
  if (!parseAmount(f.amount) && lineSum.value) f.amount = amountText(lineSum.value)
  f.split = false
  f.lines = []
}
function addLine() { f.lines.push(newLine({ amount: remaining.value > 0 ? amountText(remaining.value) : '' })); focusLine(f.lines.length - 1) }
function removeLine(i: number) { f.lines.splice(i, 1); if (f.lines.length < 2) stopSplit() }
function fillRemaining(l: LineForm) { l.amount = amountText(round2((parseAmount(l.amount) || 0) + remaining.value)) }
function focusLine(i: number) {
  setTimeout(() => document.querySelectorAll<HTMLInputElement>('[data-line-amount]')[i]?.focus(), 30)
}

const wBal = (aid: string, wid: string | null) => money(B.walletBalance(aid, wid, td))

function impactNote(t: TxnFields & { date: string }) {
  const names = [...new Set(flows(t).map(x => B.acc(x.a)?.name).filter(Boolean))].join(' et ')
  if (t.date > today()) return ` · datée du ${shortDate(t.date)} (à venir) : le solde d'aujourd'hui de ${names} ne change pas, seul le solde prévu change.`
  return ` · solde de ${names} mis à jour.`
}

async function submit() {
  err.value = ''
  if (f.split && !parseAmount(f.amount) && lineSum.value > 0) f.amount = amountText(lineSum.value)
  const amount = parseAmount(f.amount)
  if (amount === null || amount <= 0) return (err.value = 'Indiquez un montant supérieur à 0.')
  if (!isDate(f.date)) return (err.value = 'Indiquez une date.')
  if (!B.acc(f.accountId)) return (err.value = 'Choisissez un compte.')
  if (f.type === 'transfer' && !B.acc(f.toAccountId)) return (err.value = 'Choisissez le compte de destination du virement.')
  // Lignes de répartition remplies (les lignes laissées vides sont ignorées).
  const filled = f.split ? f.lines.filter(l => l.amount.trim() || l.categoryId) : []
  if (f.split) {
    if (filled.some(l => { const v = parseAmount(l.amount); return v === null || v <= 0 })) return (err.value = 'Chaque ligne de la répartition doit avoir un montant supérieur à 0.')
    if (filled.length < 2) return (err.value = 'Une répartition demande au moins deux lignes (ou annulez la répartition).')
    if (remaining.value !== 0) return (err.value = `La répartition ne correspond pas au montant : ${remaining.value > 0 ? 'il reste' : 'il y a'} ${money(Math.abs(remaining.value))} ${remaining.value > 0 ? 'à répartir' : 'de trop'}.`)
  }
  const sameAccountTransfer = f.type === 'transfer' && f.toAccountId === f.accountId
  if (sameAccountTransfer && (f.split ? filled.some(l => (l.walletId || '') === (l.toWalletId || '')) : (f.walletId || '') === (f.toWalletId || '')))
    return (err.value = 'Pour un virement dans le même compte, choisissez deux wallets différents (sur chaque ligne).')
  if (f.recurring && f.end && !datesBetween({ frequency: f.frequency, start: f.date, end: f.end }, f.date, f.end).length)
    return (err.value = 'La date de fin doit être après la date de la première échéance.')

  const S = B.S
  const accW = (w: string) => B.walletOf(f.accountId, w) ? w : null
  const toW = (w: string) => f.type === 'transfer' && B.walletOf(f.toAccountId, w) ? w : null
  const catV = (c: string) => c && catOk(c) ? c : null
  const splits: Split[] | undefined = f.split
    ? filled.map(l => ({ amount: round2(parseAmount(l.amount)!), categoryId: catV(l.categoryId), walletId: accW(l.walletId), toWalletId: toW(l.toWalletId) }))
    : undefined
  // Champs historiques = ligne principale : une ancienne version de l'app reste cohérente.
  const main = splits ? mainLine(splits) : { categoryId: catV(f.categoryId), walletId: accW(f.walletId), toWalletId: toW(f.toWalletId) }
  const base: TxnFields = {
    label: f.label.trim(), amount: round2(amount), type: f.type, accountId: f.accountId,
    walletId: main.walletId,
    toAccountId: f.type === 'transfer' ? f.toAccountId : null,
    toWalletId: main.toWalletId,
    categoryId: main.categoryId,
    ...(splits ? { splits } : {}),
  }
  /** Applique le formulaire à une opération existante (retire une ancienne répartition). */
  const applyTo = (t: Txn) => { Object.assign(t, { date: f.date, ...base }); if (!splits) delete t.splits }
  const createSeries = () => {
    const r: Recurrence = { id: uid(), frequency: f.frequency, start: f.date, end: f.end || null, generatedUntil: null, ...base, ...(splits ? { splits: splits.map(l => ({ ...l })) } : {}) }
    S.recurrences.push(r)
    generate(S, S.recurrences[S.recurrences.length - 1]!)
    return r
  }
  const single = () => { S.txns.push({ id: uid(), date: f.date, recurrenceId: null, ...base, ...(splits ? { splits: splits.map(l => ({ ...l })) } : {}) }) }
  let msg = 'Opération enregistrée'

  if (!old) {
    if (f.recurring) { const r = createSeries(); const n = B.occurrencesOf(r.id).length; msg = `${n} échéance${n > 1 ? 's' : ''} créée${n > 1 ? 's' : ''}` }
    else single()
  }
  else if (!series) {
    if (f.recurring) { S.txns = S.txns.filter(x => x.id !== old.id); createSeries(); msg = 'Opération transformée en série récurrente' }
    else applyTo(S.txns.find(x => x.id === old.id)!)
  }
  else {
    const ruleChanged = !f.recurring || f.frequency !== series.frequency || (f.end || null) !== (series.end || null)
    const scope = ruleChanged ? 'following' : await ask('Modifier une opération récurrente', 'Quelles échéances voulez-vous modifier ?', [
      { label: 'Cette opération seulement', desc: 'Les autres échéances ne changent pas', value: 'single' },
      { label: 'Celle-ci et les suivantes', desc: 'Les échéances passées ne changent pas', value: 'following' },
    ], { stacked: true })
    if (!scope) return
    const live = S.txns.find(x => x.id === old.id)
    if (!live) return emit('close')
    if (scope === 'single') applyTo(live)
    else {
      endSeriesFrom(S, live)
      if (f.recurring) createSeries(); else single()
      msg = f.recurring ? 'Série mise à jour' : 'Récurrence arrêtée, opération conservée'
    }
  }
  toast(msg)
  emit('close')
}

async function remove() {
  if (!old) return
  const S = B.S
  const live = S.txns.find(x => x.id === old.id)
  if (!live) return emit('close')
  if (!B.rec(live.recurrenceId)) {
    const ok = await confirmDanger('Supprimer cette opération ?', `${live.label || B.cat(live.categoryId)?.name || 'Opération'} · ${money(live.amount)} · ${shortDate(live.date)}`)
    if (!ok) return
    S.txns = S.txns.filter(x => x.id !== live.id)
    toast('Opération supprimée' + impactNote(live))
    return emit('close')
  }
  const v = await ask('Supprimer une opération récurrente', '', [
    { label: 'Cette opération seulement', value: 'one' },
    { label: 'Celle-ci et les suivantes', desc: 'Les échéances passées sont conservées', value: 'following' },
    { label: 'Toute la série', desc: 'Échéances passées comprises', value: 'all', kind: 'danger' as const },
  ], { stacked: true })
  if (!v) return
  if (v === 'one') S.txns = S.txns.filter(x => x.id !== live.id)
  else if (v === 'following') endSeriesFrom(S, live)
  else deleteSeries(S, live.recurrenceId!)
  toast(v === 'one' ? 'Opération supprimée' + impactNote(live)
    : 'Échéances supprimées' + (live.date > today() ? " · elles étaient à venir : le solde d'aujourd'hui ne change pas, seul le solde prévu change." : ''))
  emit('close')
}
</script>

<template>
  <AppModal :title="old ? 'Modifier l\'opération' : 'Nouvelle opération'" @close="emit('close')">
    <template v-if="!B.S.accounts.length">
      <p>Créez d'abord un compte bancaire.</p>
      <button type="button" class="btn primary" @click="open('account:new:checking')">Créer un compte</button>
    </template>
    <form v-else id="f-tx" class="form" novalidate @submit.prevent="submit">
      <div class="seg" role="radiogroup" aria-label="Type d'opération">
        <button v-for="ty in types" :key="ty.v" type="button" role="radio" :aria-checked="f.type === ty.v"
          :class="['seg-btn', `t-${ty.v}`, { on: f.type === ty.v }]" @click="f.type = ty.v"><AppIcon :name="ty.icon" /> {{ ty.label }}</button>
      </div>
      <label class="field big"><span>Montant</span>
        <span class="amount-in"><input v-model="f.amount" data-autofocus inputmode="decimal" autocomplete="off" placeholder="0,00"><span>€</span></span>
      </label>
      <div class="row2">
        <label class="field"><span>Date{{ f.recurring ? ' de la première échéance' : '' }}</span><input v-model="f.date" type="date" required></label>
        <label class="field"><span>Libellé <em>facultatif</em></span><input v-model="f.label" autocomplete="off" placeholder="ex. Supermarché, EDF…"></label>
      </div>
      <div class="row2">
        <label class="field"><span>{{ accLabel }}</span>
          <select v-model="f.accountId">
            <template v-if="checking.length && savings.length">
              <optgroup label="Comptes courants"><option v-for="a in checking" :key="a.id" :value="a.id">{{ a.name }}</option></optgroup>
              <optgroup label="Épargne"><option v-for="a in savings" :key="a.id" :value="a.id">{{ a.name }}</option></optgroup>
            </template>
            <template v-else>
              <option v-for="a in B.S.accounts" :key="a.id" :value="a.id">{{ a.name }}</option>
            </template>
          </select>
        </label>
        <label v-if="fromWallets && !f.split" class="field"><span>{{ f.type === 'income' ? 'Dans le wallet' : 'Depuis le wallet' }}</span>
          <select v-model="f.walletId">
            <option value="">Non affecté · {{ wBal(f.accountId, null) }}</option>
            <option v-for="w in B.walletsOf(f.accountId)" :key="w.id" :value="w.id">{{ w.name }} · {{ wBal(f.accountId, w.id) }}</option>
          </select>
        </label>
        <span v-else />
      </div>
      <div v-if="f.type === 'transfer'" class="row2">
        <label class="field"><span>Vers le compte</span>
          <select v-model="f.toAccountId">
            <option value="">Choisir…</option>
            <option v-for="a in toAccounts" :key="a.id" :value="a.id">{{ a.name }}{{ a.id === f.accountId ? ' (autre wallet)' : '' }}</option>
          </select>
        </label>
        <label v-if="toWallets && !f.split" class="field"><span>Vers le wallet</span>
          <select v-model="f.toWalletId">
            <option value="">Non affecté · {{ wBal(f.toAccountId, null) }}</option>
            <option v-for="w in B.walletsOf(f.toAccountId)" :key="w.id" :value="w.id">{{ w.name }} · {{ wBal(f.toAccountId, w.id) }}</option>
          </select>
        </label>
        <span v-else />
      </div>

      <!-- Une seule ligne : budget concerné -->
      <template v-if="!f.split">
        <label class="field"><span>Budget concerné<em v-if="f.type === 'transfer'"> facultatif</em></span>
          <select v-model="f.categoryId">
            <option value="">{{ f.type === 'transfer' ? 'Aucun (virement hors budget)' : 'Sans budget' }}</option>
            <template v-for="g in B.groupsOf(kind)" :key="g.id">
              <optgroup v-if="B.catsOf(g.id).length" :label="g.name">
                <option v-for="c in B.catsOf(g.id)" :key="c.id" :value="c.id">{{ c.name }}</option>
              </optgroup>
            </template>
          </select>
        </label>
        <button type="button" class="btn link" style="align-self:flex-start" @click="startSplit"><AppIcon name="plus" small /> {{ splitLabel }}</button>
      </template>

      <!-- Répartition sur plusieurs lignes -->
      <div v-else class="split-box">
        <div class="sec-head"><h3 style="font-size:15px">Répartition</h3><button type="button" class="btn link" @click="stopSplit">Annuler la répartition</button></div>
        <div v-for="(l, i) in f.lines" :key="l.key" :class="['split-row', { 'w-from': fromWallets, 'w-to': toWallets }]">
          <label class="field s-amount"><span>Montant</span>
            <span class="amount-in"><input v-model="l.amount" data-line-amount inputmode="decimal" autocomplete="off" placeholder="0,00"><span>€</span></span>
          </label>
          <label class="field s-cat"><span>Budget<em v-if="f.type === 'transfer'"> facultatif</em></span>
            <select v-model="l.categoryId">
              <option value="">{{ f.type === 'transfer' ? 'Aucun' : 'Sans budget' }}</option>
              <template v-for="g in B.groupsOf(kind)" :key="g.id">
                <optgroup v-if="B.catsOf(g.id).length" :label="g.name">
                  <option v-for="c in B.catsOf(g.id)" :key="c.id" :value="c.id">{{ c.name }}</option>
                </optgroup>
              </template>
            </select>
          </label>
          <label v-if="fromWallets" class="field s-wfrom"><span>{{ f.type === 'income' ? 'Dans le wallet' : 'Depuis le wallet' }}</span>
            <select v-model="l.walletId">
              <option value="">Non affecté</option>
              <option v-for="w in B.walletsOf(f.accountId)" :key="w.id" :value="w.id">{{ w.name }}</option>
            </select>
          </label>
          <label v-if="toWallets" class="field s-wto"><span>Vers le wallet</span>
            <select v-model="l.toWalletId">
              <option value="">Non affecté</option>
              <option v-for="w in B.walletsOf(f.toAccountId)" :key="w.id" :value="w.id">{{ w.name }}</option>
            </select>
          </label>
          <div class="s-actions">
            <button v-if="remaining !== 0" type="button" class="btn sm ghost" :title="remaining > 0 ? 'Ajouter le reste à cette ligne' : 'Retirer l\'excédent de cette ligne'" @click="fillRemaining(l)">{{ remaining > 0 ? '+ reste' : '− excédent' }}</button>
            <button type="button" class="iconbtn" :aria-label="`Supprimer la ligne ${i + 1}`" @click="removeLine(i)"><AppIcon name="trash" /></button>
          </div>
        </div>
        <div class="split-foot">
          <button type="button" class="btn sm" @click="addLine"><AppIcon name="plus" /> Ajouter une ligne</button>
          <span class="num small">
            Réparti {{ money(lineSum) }} / {{ money(parseAmount(f.amount) || 0) }}
            <b v-if="remaining !== 0" :class="remaining > 0 ? 'warn' : 'neg'"> · {{ remaining > 0 ? 'reste' : 'en trop' }} {{ money(Math.abs(remaining)) }}</b>
            <b v-else class="pos"> · ✓</b>
          </span>
        </div>
      </div>
      <div :class="['recbox', { on: f.recurring }]">
        <label class="switch">
          <input v-model="f.recurring" type="checkbox"><span class="sw" />
          <span><b>Opération récurrente</b><small>{{ series ? "Cette opération fait partie d'une série" : 'Loyer, salaire, abonnement…' }}</small></span>
        </label>
        <div v-if="f.recurring" class="rec-fields">
          <div class="seg small" role="radiogroup" aria-label="Fréquence">
            <button v-for="fr in freqs" :key="fr.v" type="button" role="radio"
              :aria-checked="f.frequency === fr.v" :class="['seg-btn', { on: f.frequency === fr.v }]" @click="f.frequency = fr.v">{{ fr.label }}</button>
          </div>
          <label class="field"><span>Date de fin <em>laisser vide pour sans fin</em></span><input v-model="f.end" type="date" :min="f.date"></label>
          <p v-if="preview" :class="['rec-preview', { neg: preview.error }]">{{ preview.text }}</p>
        </div>
      </div>
      <p v-if="err" class="err">{{ err }}</p>
    </form>
    <template v-if="B.S.accounts.length" #footer>
      <button v-if="old" type="button" class="btn ghost danger" @click="remove"><AppIcon name="trash" /> Supprimer</button>
      <span class="sp" />
      <button type="button" class="btn" @click="emit('close')">Annuler</button>
      <button type="submit" class="btn primary" form="f-tx">Enregistrer</button>
    </template>
  </AppModal>
</template>
