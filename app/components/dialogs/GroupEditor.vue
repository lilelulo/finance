<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { forgetCategories, uid } from '~/utils/budget-core'
import type { Kind } from '~/utils/budget-core'

const props = defineProps<{ groupId: string | null, kind: Kind }>()
const emit = defineEmits<{ close: [] }>()
const B = useBudget()
const { confirmDanger } = useChoice()
const { toast } = useToast()

const g = props.groupId ? B.grp(props.groupId) : undefined
const name = ref(g?.name || '')
const err = ref('')
onMounted(() => { if (props.groupId && !g) emit('close') })

function submit() {
  const n = name.value.trim()
  if (!n) return (err.value = 'Donnez un nom au groupe.')
  if (g) g.name = n
  else B.S.groups.push({ id: uid(), name: n, kind: props.kind })
  toast(g ? 'Groupe renommé' : 'Groupe créé')
  emit('close')
}
async function remove() {
  if (!g) return
  const n = B.catsOf(g.id).length
  const ok = await confirmDanger('Supprimer ce groupe ?',
    `Le groupe « ${g.name} »${n ? ` et ses ${n} catégorie${n > 1 ? 's' : ''}` : ''} seront supprimés. Les opérations associées passeront « sans budget ».`)
  if (!ok) return
  forgetCategories(B.S, B.catsOf(g.id).map(c => c.id))
  B.S.groups = B.S.groups.filter(x => x.id !== g.id)
  toast('Groupe supprimé')
  emit('close')
}
</script>

<template>
  <AppModal :title="g ? 'Modifier le groupe' : `Nouveau groupe de ${kind === 'income' ? 'revenus' : 'dépenses'}`" narrow @close="emit('close')">
    <form id="f-group" class="form" novalidate @submit.prevent="submit">
      <label class="field"><span>Nom du groupe</span><input v-model="name" data-autofocus autocomplete="off" placeholder="ex. Enfants, Animaux"></label>
      <p v-if="err" class="err">{{ err }}</p>
    </form>
    <template #footer>
      <button v-if="g" type="button" class="btn ghost danger" @click="remove"><AppIcon name="trash" /> Supprimer</button>
      <span class="sp" />
      <button type="button" class="btn" @click="emit('close')">Annuler</button>
      <button type="submit" class="btn primary" form="f-group">Enregistrer</button>
    </template>
  </AppModal>
</template>
