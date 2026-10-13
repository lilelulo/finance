<script setup lang="ts">
import { computed } from 'vue'
import { round2 } from '~/utils/budget-core'

/* Barre prévu / réel : réalisé (plein), à venir (hachuré), repère = montant prévu. */
const props = defineProps<{ planned: number, done: number, up: number, kind: 'expense' | 'income' }>()
const scale = computed(() => Math.max(props.planned, props.done + props.up, 0.01))
const pct = (v: number) => `${(Math.max(0, v) / scale.value * 100).toFixed(2)}%`
const state = computed(() => {
  const total = round2(props.done + props.up), p = round2(props.planned)
  if (props.kind === 'expense' && total > p) return 'over'
  if (props.kind === 'income' && p > 0 && total >= p) return 'ok'
  return ''
})
</script>

<template>
  <div :class="['bar', state]">
    <div class="fill"><span class="done" :style="{ width: pct(done) }" /><span class="up" :style="{ width: pct(up) }" /></div>
    <i v-if="planned > 0" class="mark" :style="{ left: pct(planned) }" />
  </div>
</template>
