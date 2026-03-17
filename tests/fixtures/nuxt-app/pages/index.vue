<script setup lang="ts">
const { data: users } = await useFetch('/api/users')

useHead({
  title: 'Home - My Nuxt App',
})
</script>

<template>
  <div class="container mx-auto p-4">
    <h1 class="text-3xl font-bold mb-4">Welcome to My Nuxt App</h1>
    <div v-if="users" class="space-y-2">
      <div v-for="user in users" :key="user.id" class="p-2 border rounded">
        {{ user.name }}
      </div>
    </div>
  </div>
</template>
