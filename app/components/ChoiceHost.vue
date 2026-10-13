<script setup lang="ts">
import { watch } from 'vue'

const { queue, settle, cancelAll } = useChoice()
const route = useRoute()
// Bouton retour pendant une question : on l'annule.
watch(() => route.fullPath, () => cancelAll())
</script>

<template>
  <AppModal v-for="item in queue" :key="item.id" :title="item.title" narrow @close="settle(item, null)">
    <p v-if="item.message">{{ item.message }}</p>
    <template v-if="item.stacked">
      <button v-for="(c, i) in item.choices" :key="i" type="button" :class="['opt', c.kind]" @click="settle(item, c.value)">
        {{ c.label }}<small v-if="c.desc">{{ c.desc }}</small>
      </button>
    </template>
    <template #footer>
      <span class="sp" />
      <button type="button" class="btn" @click="settle(item, null)">Annuler</button>
      <template v-if="!item.stacked">
        <button v-for="(c, i) in item.choices" :key="i" type="button" :class="['btn', c.kind === 'danger' ? 'danger solid' : 'primary']" @click="settle(item, c.value)">{{ c.label }}</button>
      </template>
    </template>
  </AppModal>
</template>
