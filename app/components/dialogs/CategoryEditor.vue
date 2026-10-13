<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { forgetCategories, uid } from '~/utils/budget-core'

const props = defineProps<{ categoryId: string | null, groupId: string | null }>()
const emit = defineEmits<{ close: [] }>()
const B = useBudget()
const { confirmDanger } = useChoice()
const { toast } = useToast()

const c = props.categoryId ? B.cat(props.categoryId) : undefined
const kind = B.grp(c ? c.groupId : props.groupId)?.kind || 'expense'
const name = ref(c?.name || '')
const group = ref(c?.groupId || props.groupId || B.groupsOf(kind)[0]?.id || '')
const err = ref('')
onMounted(() => { if ((props.categoryId && !c) || (!props.categoryId && !B.grp(props.groupId))) emit('close') })

function submit() {
  const n = name.value.trim()
  if (!n) return (err.value = 'Donnez un nom à la catégorie.')
  if (c) Object.assign(c, { name: n, groupId: group.value })
  else B.S.categories.push({ id: uid(), name: n, groupId: group.value })
  toast(c ? 'Catégorie modifiée' : 'Catégorie ajoutée')
  emit('close')
}
async function remove() {
  if (!c) return
  const n = B.S.txns.filter(t => t.categoryId === c.id).length
  const ok = await confirmDanger('Supprimer cette catégorie ?',
    `« ${c.name} » sera supprimée${n ? ` ; ${n} opération${n > 1 ? 's' : ''} passeront « sans budget »` : ''}. Les montants prévus pour cette catégorie seront effacés.`)
  if (!ok) return
  forgetCategories(B.S, [c.id])
  toast('Catégorie supprimée')
  emit('close')
}
</script>

<template>
  <AppModal :title="c ? 'Modifier la catégorie' : 'Nouvelle catégorie'" narrow @close="emit('close')">
    <form id="f-cat" class="form" novalidate @submit.prevent="submit">
      <label class="field"><span>Nom</span><input v-model="name" data-autofocus autocomplete="off" placeholder="ex. Assurance habitation"></label>
      <label class="field"><span>Groupe</span>
        <select v-model="group"><option v-for="g in B.groupsOf(kind)" :key="g.id" :value="g.id">{{ g.name }}</option></select>
      </label>
      <p v-if="err" class="err">{{ err }}</p>
    </form>
    <template #footer>
      <button v-if="c" type="button" class="btn ghost danger" @click="remove"><AppIcon name="trash" /> Supprimer</button>
      <span class="sp" />
      <button type="button" class="btn" @click="emit('close')">Annuler</button>
      <button type="submit" class="btn primary" form="f-cat">Enregistrer</button>
    </template>
  </AppModal>
</template>
