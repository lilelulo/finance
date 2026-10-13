<script setup lang="ts">
import { computed } from 'vue'
import { money, round2, shortDate, signedMoney, today } from '~/utils/budget-core'
import type { Account } from '~/utils/budget-core'

const props = defineProps<{ account: Account, eom: string }>()
const B = useBudget()
const { open } = useDialogs()

const td = today()
const now = computed(() => B.balance(props.account.id, td))
const atEom = computed(() => B.balance(props.account.id, props.eom))
const count = computed(() => B.S.txns.filter(t => (t.accountId === props.account.id || t.toAccountId === props.account.id) && t.date <= td).length)
const sav = computed(() => props.account.type === 'savings')
</script>

<template>
  <div :class="['acard', { sav }]">
    <div class="acard-head">
      <button type="button" class="cg-name" @click="open(`account:${account.id}`)">{{ account.name }} <AppIcon name="edit" small /></button>
      <span class="acard-type">{{ sav ? 'Épargne' : 'Courant' }}</span>
    </div>
    <span>
      <span class="eyebrow">{{ sav ? "Solde global aujourd'hui" : "Solde aujourd'hui" }}</span>
      <div :class="['acard-bal', 'num', { neg: now < 0 }]">{{ money(now) }}</div>
    </span>
    <dl>
      <div>
        <dt>Prévu au {{ shortDate(eom) }}<span v-if="round2(atEom - now)" class="muted"> ({{ signedMoney(atEom - now) }} à venir)</span></dt>
        <dd :class="{ neg: atEom < 0 }">{{ money(atEom) }}</dd>
      </div>
      <div><dt>Opérations passées</dt><dd>{{ count }}</dd></div>
    </dl>
    <div v-if="sav" class="wallets">
      <WalletRow v-for="w in account.wallets" :key="w.id" :account="account" :wallet="w" :eom="eom" />
      <WalletRow :account="account" :wallet="null" :eom="eom" />
      <button type="button" class="wrow unassigned" @click="open(`account:${account.id}:wallets`)">
        <span class="wname" style="color:var(--accent)">{{ account.wallets.length ? 'Gérer les wallets' : '+ Créer des wallets (taxe foncière, vacances…)' }}</span><span />
      </button>
    </div>
  </div>
</template>
