<script setup lang="ts">
const props = defineProps<{ name: string, small?: boolean }>()
</script>

<script lang="ts">
const PATHS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  left: '<path d="M15 6l-6 6 6 6"/>',
  right: '<path d="M9 6l6 6-6 6"/>',
  out: '<path d="M7 17L17 7M9 7h8v8"/>',
  in: '<path d="M17 7L7 17M15 17H7V9"/>',
  swap: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
  repeat: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  chart: '<path d="M4 20V11M10 20V4M16 20v-6M21 20H3"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r=".6"/>',
  bank: '<path d="M3 10l9-6 9 6M5 10v8M9.7 10v8M14.3 10v8M19 10v8M3 20h18"/>',
  tag: '<path d="M3 12V3h9l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  reset: '<path d="M4 4v6h6"/><path d="M5 15a8 8 0 1 0 2-8.5L4 10"/>',
  db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
} as const
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <svg :class="['ic', { sm: props.small }]" viewBox="0 0 24 24" aria-hidden="true" v-html="PATHS[props.name as keyof typeof PATHS] ?? ''" />
</template>
