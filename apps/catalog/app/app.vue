<script setup lang="ts">
// TODO: Resolve tenant slug from subdomain or URL path when multi-tenant routing is wired.
const tenantSlug = "demo";
const { itemCount, totalUsd } = useCart(tenantSlug);
</script>

<template>
  <div>
    <NuxtPage />
    <CartBar :item-count="itemCount" :total-usd="totalUsd" />
  </div>
</template>
