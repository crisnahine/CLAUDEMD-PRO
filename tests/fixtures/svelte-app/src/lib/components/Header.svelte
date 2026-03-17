<script lang="ts">
  import { page } from '$app/stores';
</script>

<header>
  <nav>
    <a href="/" class:active={$page.url.pathname === '/'}>Home</a>
    <a href="/about" class:active={$page.url.pathname === '/about'}>About</a>
  </nav>
</header>

<style>
  header {
    padding: 1rem;
    background: #f8f9fa;
    border-bottom: 1px solid #dee2e6;
  }

  nav {
    display: flex;
    gap: 1rem;
  }

  a {
    text-decoration: none;
    color: #495057;
  }

  a.active {
    font-weight: bold;
    color: #212529;
  }
</style>
