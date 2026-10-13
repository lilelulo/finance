<script setup lang="ts">
import type { Kind } from '~/utils/budget-core'

definePageMeta({ title: 'Catégories', noMonth: true })

const B = useBudget()
const { open } = useDialogs()
const cols: { kind: Kind, title: string }[] = [{ kind: 'expense', title: 'Dépenses' }, { kind: 'income', title: 'Revenus' }]
</script>

<template>
  <p class="muted">Les groupes rassemblent des catégories (ex. « Logement » : loyer, énergie…). Le budget se saisit par catégorie et la synthèse totalise par groupe.</p>
  <div class="catcols">
    <section v-for="col in cols" :key="col.kind" class="catcol">
      <div class="sec-head"><h2>{{ col.title }}</h2><button type="button" class="btn sm" @click="open(`group:new:${col.kind}`)"><AppIcon name="plus" /> Groupe</button></div>
      <div v-for="g in B.groupsOf(col.kind)" :key="g.id" class="panel cgroup">
        <div class="cg-head">
          <button type="button" class="cg-name" @click="open(`group:${g.id}`)">{{ g.name }} <AppIcon name="edit" small /></button>
          <span class="muted small">{{ B.catsOf(g.id).length }} catégorie{{ B.catsOf(g.id).length > 1 ? 's' : '' }}</span>
        </div>
        <ul class="clist">
          <li v-for="c in B.catsOf(g.id)" :key="c.id"><button type="button" @click="open(`cat:${c.id}`)"><span>{{ c.name }}</span><AppIcon name="edit" small /></button></li>
        </ul>
        <button type="button" class="btn link" @click="open(`cat:new:${g.id}`)"><AppIcon name="plus" small /> Ajouter une catégorie</button>
      </div>
      <p v-if="!B.groupsOf(col.kind).length" class="muted">Aucun groupe pour l'instant.</p>
    </section>
  </div>
</template>
