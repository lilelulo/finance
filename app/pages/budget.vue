<script setup lang="ts">
import { computed } from 'vue'
import { money, monthLabel, monthShort, shiftMonth, signedMoney } from '~/utils/budget-core'
import type { Kind } from '~/utils/budget-core'

definePageMeta({ title: 'Budget prévisionnel' })

const B = useBudget()
const { month, link } = useUi()
const { ask, confirmDanger } = useChoice()
const { toast } = useToast()

const prev = computed(() => shiftMonth(month.value, -1))
const totals = computed(() => B.plannedTotals(month.value))
const monthTxns = computed(() => B.txnsOfMonth(month.value))
const sections: { kind: Kind, title: string }[] = [{ kind: 'expense', title: 'Dépenses' }, { kind: 'income', title: 'Revenus' }]
const groupTotal = (gid: string) => B.catsOf(gid).reduce((s, c) => s + B.planned(month.value, c.id), 0)

async function copyPrev() {
  if (B.hasPlan(month.value) && !await ask('Remplacer le budget ?', `Le budget de ${monthLabel(month.value).toLowerCase()} sera remplacé par celui de ${monthLabel(prev.value).toLowerCase()}.`, [{ label: 'Remplacer', value: true }])) return
  B.S.plans[month.value] = { ...(B.S.plans[prev.value] || {}) }
  toast('Budget copié')
}
async function clearMonth() {
  if (!await confirmDanger('Remettre à zéro ?', `Tous les montants prévus de ${monthLabel(month.value).toLowerCase()} seront effacés.`, 'Remettre à zéro')) return
  delete B.S.plans[month.value]
  toast('Budget remis à zéro')
}
</script>

<template>
  <div class="kpis">
    <div class="kpi"><span class="eyebrow">Revenus prévus</span><span class="num pos">{{ money(totals.inc) }}</span></div>
    <div class="kpi"><span class="eyebrow">Dépenses prévues</span><span class="num neg">{{ money(totals.exp) }}</span></div>
    <div class="kpi"><span class="eyebrow">Reste à affecter</span><span :class="['num', { neg: totals.rest < 0 }]">{{ signedMoney(totals.rest) }}</span></div>
  </div>
  <div class="toolbar">
    <p class="muted small">Saisissez le montant prévu pour chaque catégorie. Tout est enregistré au fil de la frappe.</p>
    <div class="toolbar-r">
      <button type="button" class="btn" :disabled="!B.hasPlan(prev)" :title="B.hasPlan(prev) ? undefined : 'Aucun budget le mois précédent'" @click="copyPrev"><AppIcon name="copy" /> Copier {{ monthShort(prev) }}</button>
      <button type="button" class="btn ghost" :disabled="!B.hasPlan(month)" @click="clearMonth"><AppIcon name="reset" /> Remettre à zéro</button>
    </div>
  </div>
  <div class="grid2">
    <section v-for="s in sections" :key="s.kind" class="stack" :aria-label="s.title">
      <div class="sec-head"><h2>{{ s.title }}</h2></div>
      <div v-for="g in B.groupsOf(s.kind)" :key="g.id" class="panel bgroup">
        <div class="bg-head"><h3>{{ g.name }}</h3><span class="num">{{ money(groupTotal(g.id)) }}</span></div>
        <template v-if="B.catsOf(g.id).length">
          <div class="bcols"><span>Catégorie</span><span>Réel</span><span>Prévu</span><span>{{ s.kind === 'expense' ? 'Reste' : 'Écart' }}</span></div>
          <PlanRow v-for="c in B.catsOf(g.id)" :key="`${month}-${c.id}`" :c="c" :kind="s.kind" :month="month" :month-txns="monthTxns" />
        </template>
        <p v-else class="muted small" style="padding:10px 18px">Aucune catégorie. <NuxtLink class="btn link" :to="link('/categories')">Gérer les catégories</NuxtLink></p>
      </div>
      <p v-if="!B.groupsOf(s.kind).length" class="muted">Aucun groupe. <NuxtLink class="btn link" :to="link('/categories')">Créer des catégories</NuxtLink></p>
    </section>
  </div>
</template>
