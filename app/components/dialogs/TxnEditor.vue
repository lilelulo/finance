<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import {
  amountText, datesBetween, endSeriesFrom, deleteSeries, flows, generate, isDate, mkey, money, parseAmount,
  recurrencePreview, round2, shortDate, today, uid,
} from '~/utils/budget-core'
import type { Frequency, Recurrence, Txn, TxnFields, TxType } from '~/utils/budget-core'

/* Saisie / modification d'une opération, avec récurrence et wallets. */
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

watch(() => f.type, (v) => {
  const k = B.kindOfCat(f.categoryId)
  if (v === 'transfer' || (v === 'expense' && k !== 'expense') || (v === 'income' && k !== 'income')) f.categoryId = ''
})
watch(() => f.accountId, () => {
  if (!B.walletOf(f.accountId, f.walletId)) f.walletId = ''
  if (f.toAccountId === f.accountId && !B.hasWallets(f.accountId)) f.toAccountId = ''
})
watch(() => f.toAccountId, () => { if (!B.walletOf(f.toAccountId, f.toWalletId)) f.toWalletId = '' })

const wBal = (aid: string, wid: string | null) => money(B.walletBalance(aid, wid, td))

function impactNote(t: TxnFields & { date: string }) {
  const names = [...new Set(flows(t).map(x => B.acc(x.a)?.name).filter(Boolean))].join(' et ')
  if (t.date > today()) return ` · datée du ${shortDate(t.date)} (à venir) : le solde d'aujourd'hui de ${names} ne change pas, seul le solde prévu change.`
  return ` · solde de ${names} mis à jour.`
}

async function submit() {
  err.value = ''
  const amount = parseAmount(f.amount)
  if (amount === null || amount <= 0) return (err.value = 'Indiquez un montant supérieur à 0.')
  if (!isDate(f.date)) return (err.value = 'Indiquez une date.')
  if (!B.acc(f.accountId)) return (err.value = 'Choisissez un compte.')
  if (f.type === 'transfer' && !B.acc(f.toAccountId)) return (err.value = 'Choisissez le compte de destination du virement.')
  if (f.type === 'transfer' && f.toAccountId === f.accountId && (f.walletId || '') === (f.toWalletId || ''))
    return (err.value = 'Pour un virement dans le même compte, choisissez deux wallets différents.')
  if (f.recurring && f.end && !datesBetween({ frequency: f.frequency, start: f.date, end: f.end }, f.date, f.end).length)
    return (err.value = 'La date de fin doit être après la date de la première échéance.')

  const S = B.S
  const base: TxnFields = {
    label: f.label.trim(), amount: round2(amount), type: f.type, accountId: f.accountId,
    walletId: B.walletOf(f.accountId, f.walletId) ? f.walletId : null,
    toAccountId: f.type === 'transfer' ? f.toAccountId : null,
    toWalletId: f.type === 'transfer' && B.walletOf(f.toAccountId, f.toWalletId) ? f.toWalletId : null,
    categoryId: f.type === 'transfer' ? null : (f.categoryId || null),
  }
  const createSeries = () => {
    const r: Recurrence = { id: uid(), frequency: f.frequency, start: f.date, end: f.end || null, generatedUntil: null, ...base }
    S.recurrences.push(r)
    generate(S, S.recurrences[S.recurrences.length - 1]!)
    return r
  }
  const single = () => { S.txns.push({ id: uid(), date: f.date, recurrenceId: null, ...base }) }
  let msg = 'Opération enregistrée'

  if (!old) {
    if (f.recurring) { const r = createSeries(); const n = B.occurrencesOf(r.id).length; msg = `${n} échéance${n > 1 ? 's' : ''} créée${n > 1 ? 's' : ''}` }
    else single()
  }
  else if (!series) {
    if (f.recurring) { S.txns = S.txns.filter(x => x.id !== old.id); createSeries(); msg = 'Opération transformée en série récurrente' }
    else Object.assign(S.txns.find(x => x.id === old.id)!, { date: f.date, ...base })
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
    if (scope === 'single') Object.assign(live, { date: f.date, ...base })
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
        <label v-if="B.hasWallets(f.accountId)" class="field"><span>{{ f.type === 'income' ? 'Dans le wallet' : 'Depuis le wallet' }}</span>
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
        <label v-if="B.hasWallets(f.toAccountId)" class="field"><span>Vers le wallet</span>
          <select v-model="f.toWalletId">
            <option value="">Non affecté · {{ wBal(f.toAccountId, null) }}</option>
            <option v-for="w in B.walletsOf(f.toAccountId)" :key="w.id" :value="w.id">{{ w.name }} · {{ wBal(f.toAccountId, w.id) }}</option>
          </select>
        </label>
        <span v-else />
      </div>
      <label v-else class="field"><span>Budget concerné</span>
        <select v-model="f.categoryId">
          <option value="">Sans budget</option>
          <template v-for="g in B.groupsOf(kind)" :key="g.id">
            <optgroup v-if="B.catsOf(g.id).length" :label="g.name">
              <option v-for="c in B.catsOf(g.id)" :key="c.id" :value="c.id">{{ c.name }}</option>
            </optgroup>
          </template>
        </select>
      </label>
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
