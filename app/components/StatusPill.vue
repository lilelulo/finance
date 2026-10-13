<script setup lang="ts">
import { computed } from 'vue'
import { money, round2 } from '~/utils/budget-core'

const props = defineProps<{ planned: number, total: number, kind: 'expense' | 'income' }>()
const pill = computed(() => {
  const p = round2(props.planned), t = round2(props.total)
  if (!p && !t) return { cls: '', text: 'Rien de prévu' }
  if (props.kind === 'expense') {
    if (!p) return { cls: 'warn', text: `Non prévu · ${money(t)}` }
    const d = p - t
    return d >= 0 ? { cls: 'pos', text: `Reste ${money(d)}` } : { cls: 'neg', text: `Dépassé de ${money(-d)}` }
  }
  const d = t - p
  if (d >= 0) return { cls: 'pos', text: d > 0 ? `+${money(d)} au-delà du prévu` : 'Objectif atteint' }
  return { cls: '', text: `Attendu ${money(-d)}` }
})
</script>

<template>
  <span :class="['pill', pill.cls]">{{ pill.text }}</span>
</template>
