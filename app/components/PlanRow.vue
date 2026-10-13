<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { amountText, money, parseAmount, round2, setPlanned, signedMoney } from '~/utils/budget-core'
import type { Category, Kind, Txn } from '~/utils/budget-core'

/* Une ligne du budget : montant prévu saisi au fil de la frappe. */
const props = defineProps<{ c: Category, kind: Kind, month: string, monthTxns: Txn[] }>()
const B = useBudget()

const planned = computed(() => B.planned(props.month, props.c.id))
const real = computed(() => {
  // réel = même calcul que la synthèse (remboursements en déduction)
  let v = 0
  for (const t of props.monthTxns) {
    if (t.categoryId !== props.c.id || t.type === 'transfer') continue
    v += t.type === props.kind ? t.amount : -t.amount
  }
  return v
})
const ecart = computed(() => props.kind === 'expense' ? planned.value - real.value : real.value - planned.value)

const text = ref(amountText(planned.value))
const focused = ref(false)
const invalid = ref(false)
watch(planned, (v) => { if (!focused.value) text.value = amountText(v) })

function onInput(e: Event) {
  const raw = (e.target as HTMLInputElement).value
  text.value = raw
  const v = parseAmount(raw)
  if (raw.trim() === '' || (v !== null && v >= 0)) { invalid.value = false; setPlanned(B.S, props.month, props.c.id, v || 0) }
  else invalid.value = true
}
function onBlur() {
  focused.value = false
  if (!invalid.value) text.value = amountText(planned.value)
}
function onEnter(e: KeyboardEvent) {
  const all = [...document.querySelectorAll<HTMLInputElement>('[data-plan]')]
  const next = all[all.indexOf(e.target as HTMLInputElement) + 1]
  next?.focus(); next?.select()
}
</script>

<template>
  <div class="brow">
    <label :for="`p-${c.id}`">{{ c.name }}</label>
    <span class="real num">Réel {{ money(real) }}</span>
    <span class="plan-in">
      <input :id="`p-${c.id}`" data-plan :class="{ invalid }" :value="text" inputmode="decimal" autocomplete="off" placeholder="0"
        @input="onInput" @focus="focused = true" @blur="onBlur" @keydown.enter.prevent="onEnter"><span>€</span>
    </span>
    <span class="ecart">
      <span v-if="!planned && !real" class="muted">—</span>
      <span v-else :class="['num', round2(ecart) < 0 ? 'neg' : round2(ecart) > 0 ? 'pos' : '']">{{ signedMoney(ecart) }}</span>
    </span>
  </div>
</template>
