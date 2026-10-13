<script setup lang="ts">
import { computed } from 'vue'
import type { GroupSummary } from '~/utils/budget-core'

const props = defineProps<{ group: GroupSummary, kind: 'expense' | 'income' }>()
const { openGroups } = useBudget()
const gkey = computed(() => 'g:' + props.group.g.id)
function onToggle(e: Event) {
  if ((e.target as HTMLDetailsElement).open) openGroups.add(gkey.value)
  else openGroups.delete(gkey.value)
}
</script>

<template>
  <details class="gcard" :open="openGroups.has(gkey)" @toggle="onToggle">
    <summary>
      <AppIcon name="right" class="chev" />
      <LineRow :name="group.g.name" :planned="group.planned" :done="group.done" :up="group.up" :kind="kind" is-group />
    </summary>
    <div class="glines">
      <LineRow v-for="l in group.lines" :key="l.c.id" :name="l.c.name" :planned="l.planned" :done="l.done" :up="l.up" :kind="kind" />
      <p v-if="!group.lines.length" class="muted small">Aucune catégorie dans ce groupe.</p>
    </div>
  </details>
</template>
