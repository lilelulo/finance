<script setup lang="ts">
import { computed } from 'vue'
import { money, signedFor, signedMoney, today } from '~/utils/budget-core'
import type { Txn } from '~/utils/budget-core'

const props = defineProps<{ t: Txn, accountFilter: string | null, walletFilter?: string | null }>()
const { cat, catPath, rec } = useBudget()
const { open } = useDialogs()

const c = computed(() => cat(props.t.categoryId))
const title = computed(() => props.t.label || c.value?.name || (props.t.type === 'transfer' ? 'Virement' : 'Opération'))
const icon = computed(() => ({ expense: 'out', income: 'in', transfer: 'swap' } as const)[props.t.type])
const amount = computed(() => props.t.type === 'transfer' && !props.accountFilter
  ? money(props.t.amount)
  : signedMoney(signedFor(props.t, props.accountFilter, props.walletFilter)))
</script>

<template>
  <button type="button" :class="['tx', `t-${t.type}`]" @click="open(`txn:${t.id}`)">
    <span class="tx-ico"><AppIcon :name="icon" /></span>
    <span class="tx-main">
      <span class="tx-label">
        <span>{{ title }}</span>
        <span v-if="rec(t.recurrenceId)" class="rec-ic" title="Opération récurrente"><AppIcon name="repeat" small /></span>
        <span v-if="t.date > today()" class="tag up">à venir</span>
      </span>
      <span class="tx-sub">
        <template v-if="t.type === 'transfer'">
          <SideLabel :account-id="t.accountId" :wallet-id="t.walletId" /> → <SideLabel :account-id="t.toAccountId" :wallet-id="t.toWalletId" />
        </template>
        <template v-else>
          <SideLabel :account-id="t.accountId" :wallet-id="t.walletId" /> ·
          <span v-if="c">{{ catPath(t.categoryId) }}</span><span v-else class="warn">Sans budget</span>
        </template>
      </span>
    </span>
    <span class="tx-amt num">{{ amount }}</span>
  </button>
</template>
