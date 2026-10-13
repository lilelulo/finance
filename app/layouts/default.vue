<script setup lang="ts">
import { computed } from 'vue'

const route = useRoute()
const { open } = useDialogs()
const title = computed(() => (route.meta.title as string) || 'Mon Budget')
useHead({ title: () => `${title.value} · Mon Budget` })
</script>

<template>
  <div class="shell">
    <aside class="side" aria-label="Navigation">
      <div class="brand"><span class="brand-mark">€</span><b>Mon Budget</b></div>
      <nav class="nav"><NavLinks /></nav>
      <div class="side-foot">
        <StoreStatus />
        <button type="button" class="btn sm" @click="open('data')">Sauvegarde &amp; données</button>
      </div>
    </aside>
    <main>
      <header class="top">
        <div class="top-in">
          <h1>{{ title }}</h1>
          <MonthSelector v-if="!route.meta.noMonth" />
          <button type="button" class="iconbtn mobile-only" aria-label="Sauvegarde et données" @click="open('data')"><AppIcon name="db" /></button>
          <button type="button" class="btn primary new-btn" @click="open('txn')"><AppIcon name="plus" /><span class="lbl">Opération</span></button>
        </div>
      </header>
      <div class="content">
        <DemoBanner />
        <slot />
      </div>
    </main>
    <nav class="tabbar" aria-label="Navigation"><NavLinks /></nav>
    <DialogHost />
    <ChoiceHost />
    <ToastHost />
  </div>
</template>
