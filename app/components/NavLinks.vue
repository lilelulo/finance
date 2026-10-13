<script setup lang="ts">
const route = useRoute()
const { link } = useUi()
const items = [
  { path: '/', label: 'Synthèse', icon: 'chart' },
  { path: '/operations', label: 'Opérations', icon: 'list' },
  { path: '/budget', label: 'Budget', icon: 'target' },
  { path: '/comptes', label: 'Comptes', icon: 'bank' },
  { path: '/categories', label: 'Catégories', icon: 'tag' },
]
const active = (p: string) => p === '/' ? route.path === '/' : route.path.startsWith(p)
</script>

<template>
  <NuxtLink v-for="it in items" :key="it.path" :to="link(it.path)" :class="{ on: active(it.path) }" :aria-current="active(it.path) ? 'page' : undefined">
    <AppIcon :name="it.icon" /><span>{{ it.label }}</span>
  </NuxtLink>
</template>
