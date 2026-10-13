<script setup lang="ts">
import { computed } from 'vue'
import { endOfMonth, money, shortDate, today } from '~/utils/budget-core'

definePageMeta({ title: 'Comptes bancaires' })

const B = useBudget()
const { month } = useUi()
const { open } = useDialogs()

const eom = computed(() => endOfMonth(month.value))
const checking = computed(() => B.S.accounts.filter(a => a.type !== 'savings'))
const savings = computed(() => B.S.accounts.filter(a => a.type === 'savings'))
const sumToday = (l: { id: string }[]) => l.reduce((s, a) => s + B.balance(a.id, today()), 0)
const totEom = computed(() => B.S.accounts.reduce((s, a) => s + B.balance(a.id, eom.value), 0))
</script>

<template>
  <section class="panel hero-total">
    <div><span class="eyebrow">Total aujourd'hui</span><div :class="['num', 'big', { neg: sumToday(B.S.accounts) < 0 }]">{{ money(sumToday(B.S.accounts)) }}</div></div>
    <div><span class="eyebrow">Comptes courants</span><div class="num" style="font-size:20px;font-weight:600">{{ money(sumToday(checking)) }}</div></div>
    <div><span class="eyebrow">Épargne</span><div class="num" style="font-size:20px;font-weight:600">{{ money(sumToday(savings)) }}</div></div>
    <div><span class="eyebrow">Prévu au {{ shortDate(eom) }}</span><div class="num" style="font-size:20px;font-weight:600">{{ money(totEom) }}</div></div>
  </section>
  <section class="acc-sec">
    <div class="sec-head"><h2>Comptes courants</h2><button type="button" class="btn sm" @click="open('account:new:checking')"><AppIcon name="plus" /> Compte courant</button></div>
    <div class="accounts">
      <AccountCard v-for="a in checking" :key="a.id" :account="a" :eom="eom" />
      <p v-if="!checking.length" class="muted">Aucun compte courant.</p>
    </div>
  </section>
  <section class="acc-sec">
    <div class="sec-head"><h2>Épargne</h2><button type="button" class="btn sm" @click="open('account:new:savings')"><AppIcon name="plus" /> Compte épargne</button></div>
    <div class="accounts sav-grid">
      <AccountCard v-for="a in savings" :key="a.id" :account="a" :eom="eom" />
      <p v-if="!savings.length" class="muted">Aucun compte d'épargne.</p>
    </div>
  </section>
</template>
