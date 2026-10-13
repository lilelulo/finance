<script setup lang="ts">
import { money, round2 } from '~/utils/budget-core'

defineProps<{ name: string, planned: number, done: number, up: number, kind: 'expense' | 'income', isGroup?: boolean }>()
</script>

<template>
  <div :class="['line', { 'is-group': isGroup }]">
    <div class="line-top">
      <span class="line-name">{{ name }}</span>
      <span class="line-fig num"><b>{{ money(done + up) }}</b><span class="muted"> / {{ money(planned) }}</span></span>
    </div>
    <BudgetBar :planned="planned" :done="done" :up="up" :kind="kind" />
    <div class="line-foot">
      <StatusPill :planned="planned" :total="done + up" :kind="kind" />
      <span v-if="round2(up)" class="muted small">dont {{ money(up) }} à venir</span>
    </div>
  </div>
</template>
