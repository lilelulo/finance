<script setup lang="ts">
defineProps<{ icon: 'list' | 'repeat' | 'target' | 'bank' | 'tag' }>()
</script>

<template>
  <div class="panel empty">
    <AppIcon :name="icon" />
    <p><slot /></p>
    <div v-if="$slots.actions" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center"><slot name="actions" /></div>
  </div>
</template>
