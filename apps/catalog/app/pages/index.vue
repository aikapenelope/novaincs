<script setup lang="ts">
/**
 * Root page — /
 *
 * The catalog requires a tenant slug in the URL.
 * This page shows a message directing users to the correct URL.
 * In production, this would redirect to the marketing site.
 */
useHead({ title: "Qyne — Catalogo" });
</script>

<template>
  <div class="root-page">
    <h1>Qyne</h1>
    <p>Para ver un catalogo, visita <code>/t/{slug-de-la-tienda}</code></p>
  </div>
</template>

<style scoped>
.root-page {
  max-width: 500px;
  margin: 0 auto;
  padding: 3rem 1rem;
  text-align: center;
}

h1 {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 1rem;
}

p {
  color: #6b7280;
}

code {
  background: #f3f4f6;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-size: 0.875rem;
}
</style>
