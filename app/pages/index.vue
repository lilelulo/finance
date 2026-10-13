<script setup lang="ts">
import { computed } from 'vue'
import { endOfMonth, money, monthLabel, round2, shortDate, signedMoney, sumBy } from '~/utils/budget-core'

definePageMeta({ title: 'Synthèse' })

const B = useBudget()
const { month, link } = useUi()
const { open } = useDialogs()

const data = computed(() => {
  const mk = month.value
  const inc = B.summary(mk, 'income'), exp = B.summary(mk, 'expense')
  const uI = B.uncategorized(mk, 'income'), uE = B.uncategorized(mk, 'expense')
  const incP = sumBy(inc, 'planned'), incR = sumBy(inc, 'total') + uI.total, incUp = sumBy(inc, 'up') + uI.up
  const expP = sumBy(exp, 'planned'), expR = sumBy(exp, 'total') + uE.total, expUp = sumBy(exp, 'up') + uE.up
  const eom = endOfMonth(mk)
  return {
    inc, exp, uI, uE, incP, incR, incUp, expP, expR, expUp, solP: incP - expP, solR: incR - expR, eom,
    nothing: !B.hasPlan(mk) && !B.txnsOfMonth(mk).length,
    accounts: B.S.accounts.map(a => ({
      a,
      b: B.balance(a.id, eom),
      subs: a.type === 'savings' && a.wallets.length
        ? [...a.wallets.map(w => ({ id: w.id, name: w.name, v: B.walletBalance(a.id, w.id, eom) })),
            { id: 'none', name: 'Non affecté', v: B.walletBalance(a.id, null, eom) }]
        : [],
    })),
  }
})
const balTotal = computed(() => data.value.accounts.reduce((s, x) => s + x.b, 0))
const cls = (v: number) => round2(v) > 0 ? 'pos' : round2(v) < 0 ? 'neg' : ''
</script>

<template>
  <section class="panel statement" aria-label="Prévu et réel du mois">
    <div class="st-row head"><span>{{ monthLabel(month) }}</span><span>Prévu</span><span>Réel</span><span>Écart</span></div>
    <div class="st-row">
      <span class="lbl">Revenus</span><span class="num">{{ money(data.incP) }}</span>
      <span class="num">{{ money(data.incR) }}<span v-if="round2(data.incUp)" class="sub">dont {{ money(data.incUp) }} à venir</span></span>
      <span :class="['num', cls(data.incR - data.incP)]">{{ signedMoney(data.incR - data.incP) }}</span>
    </div>
    <div class="st-row">
      <span class="lbl">Dépenses</span><span class="num">{{ money(data.expP) }}</span>
      <span class="num">{{ money(data.expR) }}<span v-if="round2(data.expUp)" class="sub">dont {{ money(data.expUp) }} à venir</span></span>
      <span :class="['num', cls(data.expP - data.expR)]">{{ signedMoney(data.expP - data.expR) }}</span>
    </div>
    <div class="st-row total">
      <span class="lbl">Solde du mois</span>
      <span :class="['num', cls(data.solP)]">{{ signedMoney(data.solP) }}</span>
      <span :class="['num', cls(data.solR)]">{{ signedMoney(data.solR) }}</span>
      <span :class="['num', cls(data.solR - data.solP)]">{{ signedMoney(data.solR - data.solP) }}</span>
    </div>
  </section>

  <EmptyState v-if="data.nothing" icon="target">
    Aucun budget ni opération pour {{ monthLabel(month).toLowerCase() }}.
    <template #actions>
      <NuxtLink class="btn" :to="link('/budget')">Préparer le budget</NuxtLink>
      <button type="button" class="btn primary" @click="open('txn')"><AppIcon name="plus" /> Ajouter une opération</button>
    </template>
  </EmptyState>

  <div v-if="data.uE.total || data.uI.total" class="banner">
    <p>
      <b>Opérations sans budget :</b>
      {{ [data.uE.total ? `dépenses ${money(data.uE.total)}` : '', data.uI.total ? `revenus ${money(data.uI.total)}` : ''].filter(Boolean).join(' · ') }}.
      Elles comptent dans le réel mais dans aucune catégorie.
    </p>
    <NuxtLink class="btn sm" :to="link('/operations')">Voir les opérations</NuxtLink>
  </div>

  <div class="legend" aria-hidden="true"><span><i />Réalisé</span><span><i class="up" />À venir ce mois</span><span><i class="mk" />Montant prévu</span></div>

  <div class="grid2">
    <section class="stack" aria-label="Dépenses">
      <div class="sec-head"><h2>Dépenses</h2><span class="num muted">{{ money(data.expR - data.uE.total) }} / {{ money(data.expP) }}</span></div>
      <GroupCard v-for="G in data.exp" :key="G.g.id" :group="G" kind="expense" />
      <p v-if="!data.exp.length" class="muted">Aucun groupe de dépenses.</p>
    </section>
    <div class="stack">
      <section class="stack" aria-label="Revenus">
        <div class="sec-head"><h2>Revenus</h2><span class="num muted">{{ money(data.incR - data.uI.total) }} / {{ money(data.incP) }}</span></div>
        <GroupCard v-for="G in data.inc" :key="G.g.id" :group="G" kind="income" />
        <p v-if="!data.inc.length" class="muted">Aucun groupe de revenus.</p>
      </section>
      <section class="stack" aria-label="Soldes en fin de mois">
        <div class="sec-head"><h2>Soldes au {{ shortDate(data.eom) }}</h2></div>
        <div class="panel balances">
          <template v-for="x in data.accounts" :key="x.a.id">
            <div class="bal-row"><span>{{ x.a.name }}</span><span :class="['num', { neg: x.b < 0 }]">{{ money(x.b) }}</span></div>
            <div v-for="w in x.subs" :key="w.id" class="bal-row sub"><span>{{ w.name }}</span><span :class="['num', { neg: w.v < 0 }]">{{ money(w.v) }}</span></div>
          </template>
          <div class="bal-row"><span>Total</span><span :class="['num', { neg: balTotal < 0 }]">{{ money(balTotal) }}</span></div>
        </div>
      </section>
    </div>
  </div>
</template>
