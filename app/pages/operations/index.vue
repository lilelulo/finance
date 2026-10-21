<script setup lang="ts">
import { computed } from 'vue'
import { dayLabel, flows, linesOf, monthLabel, signedFor, signedMoney } from '~/utils/budget-core'
import type { Txn } from '~/utils/budget-core'

definePageMeta({ title: 'Opérations' })

const B = useBudget()
const { month, accFilter, walletFilter, setQuery, link } = useUi()
const { open } = useDialogs()
const route = useRoute()

const search = computed({
  get: () => typeof route.query.q === 'string' ? route.query.q : '',
  set: (v: string) => { setQuery({ q: v || null }) },
})
const acc = computed(() => accFilter.value && B.acc(accFilter.value) ? accFilter.value : null)
const wal = computed(() => {
  if (!acc.value || walletFilter.value === undefined) return undefined
  return walletFilter.value === null || B.walletOf(acc.value, walletFilter.value) ? walletFilter.value : undefined
})

const list = computed(() => {
  let l = B.txnsOfMonth(month.value)
  const f = acc.value, w = wal.value
  if (f) l = l.filter(t => flows(t).some(x => x.a === f && (w === undefined || (x.w || null) === w)))
  const q = search.value.trim().toLowerCase()
  if (q) {
    l = l.filter(t => [t.label, B.acc(t.accountId)?.name, B.acc(t.toAccountId)?.name, String(t.amount).replace('.', ','),
      ...linesOf(t).flatMap(x => [B.cat(x.categoryId)?.name, B.grp(B.cat(x.categoryId)?.groupId)?.name,
        B.walletOf(t.accountId, x.walletId)?.name, B.walletOf(t.toAccountId, x.toWalletId)?.name])]
      .join(' ').toLowerCase().includes(q))
  }
  return [...l].sort((a, b) => b.date.localeCompare(a.date))
})
const totals = computed(() => {
  let inS = 0, outS = 0
  for (const t of list.value) { const v = signedFor(t, acc.value, wal.value); if (v > 0) inS += v; else outS -= v }
  return { inS, outS }
})
const days = computed(() => {
  const out: { date: string, items: Txn[], net: number }[] = []
  for (const t of list.value) {
    const last = out[out.length - 1]
    if (last && last.date === t.date) last.items.push(t)
    else out.push({ date: t.date, items: [t], net: 0 })
  }
  for (const d of out) d.net = d.items.reduce((s, t) => s + signedFor(t, acc.value, wal.value), 0)
  return out
})
const walletName = computed(() => wal.value === undefined ? '' : wal.value === null ? 'Non affecté' : B.walletOf(acc.value, wal.value)?.name)
</script>

<template>
  <div class="toolbar">
    <div class="chips" role="group" aria-label="Filtrer par compte">
      <button type="button" :class="['chip', { on: !acc }]" :aria-pressed="!acc" @click="setQuery({ compte: null, wallet: null })">Tous les comptes</button>
      <button v-for="a in B.S.accounts" :key="a.id" type="button" :class="['chip', { on: acc === a.id }]" :aria-pressed="acc === a.id" @click="setQuery({ compte: a.id, wallet: null })">{{ a.name }}</button>
      <span v-if="wal !== undefined" class="wfilter">{{ walletName }}<button type="button" aria-label="Retirer le filtre wallet" @click="setQuery({ wallet: null })"><AppIcon name="x" small /></button></span>
    </div>
    <div class="toolbar-r">
      <label class="search"><AppIcon name="search" /><input v-model="search" type="search" placeholder="Rechercher" aria-label="Rechercher une opération"></label>
      <NuxtLink class="btn" :to="link('/operations/recurrences')"><AppIcon name="repeat" /> Récurrences <span class="count">{{ B.S.recurrences.length }}</span></NuxtLink>
    </div>
  </div>

  <EmptyState v-if="!list.length" icon="list">
    {{ search ? 'Aucune opération ne correspond à la recherche.' : `Aucune opération en ${monthLabel(month).toLowerCase()}.` }}
    <template v-if="!search" #actions>
      <button type="button" class="btn primary" @click="open('txn')"><AppIcon name="plus" /> Ajouter une opération</button>
    </template>
  </EmptyState>
  <template v-else>
    <div class="panel totals">
      <div><span class="eyebrow">Entrées</span><span class="num pos">{{ signedMoney(totals.inS) }}</span></div>
      <div><span class="eyebrow">Sorties</span><span class="num neg">{{ signedMoney(-totals.outS) }}</span></div>
      <div><span class="eyebrow">Net</span><span class="num">{{ signedMoney(totals.inS - totals.outS) }}</span></div>
      <div><span class="eyebrow">Opérations</span><span class="num">{{ list.length }}</span></div>
    </div>
    <div class="panel">
      <div v-for="d in days" :key="d.date" class="day">
        <div class="day-head"><span>{{ dayLabel(d.date) }}</span><span class="num">{{ signedMoney(d.net) }}</span></div>
        <TxnRow v-for="t in d.items" :key="t.id" :t="t" :account-filter="acc" :wallet-filter="wal" />
      </div>
    </div>
  </template>
</template>
