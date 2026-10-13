<script setup lang="ts">
const { message, visible } = useToast()
</script>

<template>
  <div :class="['toast', { show: visible }]" role="status" aria-live="polite">{{ message }}</div>
</template>
