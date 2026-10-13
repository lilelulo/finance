<script lang="ts">
/* Pile des fenêtres ouvertes : Échap ne ferme que celle du dessus. */
const stack: symbol[] = []
</script>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

defineProps<{ title: string, narrow?: boolean }>()
const emit = defineEmits<{ close: [] }>()
const sheet = ref<HTMLElement>()
const me = Symbol('modal')
let prevFocus: Element | null = null

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && stack[stack.length - 1] === me) { e.stopPropagation(); emit('close') }
}
onMounted(async () => {
  prevFocus = document.activeElement
  stack.push(me)
  window.addEventListener('keydown', onKey)
  await nextTick()
  const el = sheet.value?.querySelector<HTMLElement>('[data-autofocus]')
    || sheet.value?.querySelector<HTMLElement>('.sheet-body input, .sheet-body select, .sheet-body button, .sheet-foot .primary')
  el?.focus()
})
onBeforeUnmount(() => {
  const i = stack.indexOf(me)
  if (i >= 0) stack.splice(i, 1)
  window.removeEventListener('keydown', onKey)
  if (prevFocus instanceof HTMLElement && prevFocus.isConnected) prevFocus.focus()
})
</script>

<template>
  <Teleport to="body">
    <div class="layer">
      <div class="scrim" @click="emit('close')" />
      <div ref="sheet" :class="['sheet', { narrow }]" role="dialog" aria-modal="true" :aria-label="title">
        <header class="sheet-head">
          <h2>{{ title }}</h2>
          <button type="button" class="iconbtn" aria-label="Fermer" @click="emit('close')"><AppIcon name="x" /></button>
        </header>
        <div class="sheet-body"><slot /></div>
        <footer v-if="$slots.footer" class="sheet-foot"><slot name="footer" /></footer>
      </div>
    </div>
  </Teleport>
</template>
