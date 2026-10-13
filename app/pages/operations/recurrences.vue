<script setup lang="ts">
import { computed } from 'vue'
import { money, parseDate, shortDate, stopSeries, deleteSeries, today, weekday } from '~/utils/budget-core'
import type { Recurrence } from '~/utils/budget-core'

definePageMeta({ title: 'Opérations récurrentes', noMonth: true })

const B = useBudget()
const { link } = useUi()
const { open } = useDialogs()
const { ask, confirmDanger } = useChoice()
const { toast } = useToast()

const items = computed(() => {
  const td = today()
  return [...B.S.recurrences].sort((a, b) => (a.label || '').localeCompare(b.label || '', 'fr')).map((r) => {
    const occ = B.occurrencesOf(r.id)
    const c = B.cat(r.categoryId)
    return {
      r, occ, c,
      next: occ.find(t => t.date >= td),
      ended: !!r.end && r.end < td,
      title: r.label || c?.name || (r.type === 'transfer' ? 'Virement' : 'Opération'),
      freq: r.frequency === 'weekly' ? `Chaque ${weekday(r.start)}` : `Le ${parseDate(r.start).getDate()} de chaque mois`,
      until: r.end ? `jusqu'au ${shortDate(r.end)}` : 'sans date de fin',
      sign: r.type === 'income' ? '+' : r.type === 'expense' ? '−' : '',
    }
  })
})

function edit(it: { next?: { id: string }, occ: { id: string }[] }) {
  const t = it.next || it.occ[it.occ.length - 1]
  if (t) open(`txn:${t.id}`)
}
async function stop(r: Recurrence) {
  if (!await ask('Arrêter la série ?', "Les échéances après aujourd'hui seront supprimées. Les opérations passées sont conservées.", [{ label: 'Arrêter', value: true }])) return
  stopSeries(B.S, r.id)
  toast('Série arrêtée')
}
async function remove(r: Recurrence, n: number) {
  if (!await confirmDanger('Supprimer toute la série ?', `Les ${n} opérations de cette série seront supprimées, y compris les passées.`)) return
  deleteSeries(B.S, r.id)
  toast('Série supprimée')
}
</script>

<template>
  <div class="sec-head"><NuxtLink class="btn ghost" :to="link('/operations')"><AppIcon name="left" /> Opérations</NuxtLink></div>
  <EmptyState v-if="!items.length" icon="repeat">
    Aucune opération récurrente.<br>Activez « Opération récurrente » lors de la saisie d'une opération.
    <template #actions><button type="button" class="btn primary" @click="open('txn')"><AppIcon name="plus" /> Nouvelle opération</button></template>
  </EmptyState>
  <div v-else class="panel rlist">
    <div v-for="it in items" :key="it.r.id" :class="['ritem', `t-${it.r.type}`, { ended: it.ended }]">
      <span class="tx-ico"><AppIcon name="repeat" /></span>
      <span class="tx-main">
        <span class="tx-label"><span>{{ it.title }}</span><span v-if="it.ended" class="tag">terminée</span></span>
        <span class="tx-sub">
          <template v-if="it.r.type === 'transfer'"><SideLabel :account-id="it.r.accountId" :wallet-id="it.r.walletId" /> → <SideLabel :account-id="it.r.toAccountId" :wallet-id="it.r.toWalletId" /></template>
          <template v-else><SideLabel :account-id="it.r.accountId" :wallet-id="it.r.walletId" /> · {{ it.c ? B.catPath(it.r.categoryId) : 'Sans budget' }}</template>
        </span>
        <span class="tx-sub">{{ it.freq }}, {{ it.until }}<template v-if="it.next"> · prochaine le {{ shortDate(it.next.date) }}</template></span>
      </span>
      <span class="tx-amt num">{{ it.sign }}{{ money(it.r.amount) }}</span>
      <div class="ritem-actions">
        <button v-if="it.next || it.occ.length" type="button" class="btn ghost sm" @click="edit(it)"><AppIcon name="edit" small /> Modifier {{ it.next ? 'à partir de la prochaine' : 'la dernière' }}</button>
        <button v-if="!it.ended" type="button" class="btn ghost sm" @click="stop(it.r)"><AppIcon name="stop" small /> Arrêter après aujourd'hui</button>
        <button type="button" class="btn ghost sm danger" @click="remove(it.r, it.occ.length)"><AppIcon name="trash" small /> Supprimer la série</button>
      </div>
    </div>
  </div>
</template>
