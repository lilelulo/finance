<script setup lang="ts">
import { computed } from 'vue'
import { money, round2, shortDate, today } from '~/utils/budget-core'
import type { Account, Wallet } from '~/utils/budget-core'

const props = defineProps<{ account: Account, wallet: Wallet | null, eom: string }>()
const B = useBudget()
const { link } = useUi()

const now = computed(() => B.walletBalance(props.account.id, props.wallet?.id ?? null, today()))
const atEom = computed(() => B.walletBalance(props.account.id, props.wallet?.id ?? null, props.eom))
const goal = computed(() => props.wallet?.goal || 0)
</script>

<template>
  <NuxtLink :class="['wrow', { unassigned: !wallet }]" :to="link('/operations', { compte: account.id, wallet: wallet?.id ?? 'aucun' })" title="Voir les opérations de ce wallet">
    <span class="wname">{{ wallet?.name ?? 'Non affecté' }}</span>
    <span :class="['wbal', { neg: now < 0 }]">{{ money(now) }}</span>
    <span v-if="goal || round2(atEom) !== round2(now)" class="wmeta">
      <template v-if="goal">
        <BudgetBar :planned="goal" :done="Math.max(0, now)" :up="0" kind="income" />
        <span class="num">{{ Math.round(Math.max(0, now) / goal * 100) }} % de {{ money(goal) }}</span>
      </template>
      <span v-if="round2(atEom) !== round2(now)">au {{ shortDate(eom) }} : <span class="num">{{ money(atEom) }}</span></span>
    </span>
  </NuxtLink>
</template>
