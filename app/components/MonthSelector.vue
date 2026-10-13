<script setup lang="ts">
import { mkey, monthLabel, shiftMonth, today } from '~/utils/budget-core'

const { month, setMonth } = useUi()
</script>

<template>
  <div class="month" role="group" aria-label="Mois">
    <button type="button" class="mbtn" aria-label="Mois précédent" @click="setMonth(shiftMonth(month, -1))"><AppIcon name="left" /></button>
    <button type="button" class="mlabel" title="Revenir au mois en cours" @click="setMonth(mkey(today()))">{{ monthLabel(month) }}</button>
    <button type="button" class="mbtn" aria-label="Mois suivant" @click="setMonth(shiftMonth(month, 1))"><AppIcon name="right" /></button>
  </div>
</template>
