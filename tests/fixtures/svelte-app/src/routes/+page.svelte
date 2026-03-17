<script lang="ts">
  import type { PageData } from './$types';
  import Header from '$lib/components/Header.svelte';

  export let data: PageData;
</script>

<svelte:head>
  <title>Home - My SvelteKit App</title>
</svelte:head>

<Header />

<main class="container">
  <h1>Welcome to My SvelteKit App</h1>
  {#if data.users}
    <ul>
      {#each data.users as user}
        <li>{user.name} ({user.email})</li>
      {/each}
    </ul>
  {/if}
</main>
