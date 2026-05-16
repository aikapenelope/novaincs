<script setup lang="ts">
const route = useRoute();
const tenantSlug = computed(() => (route.params.tenantSlug as string) || "");
const cart = computed(() => {
  if (!tenantSlug.value) return { itemCount: ref(0), totalUsd: ref(0) };
  return useCart(tenantSlug.value);
});
</script>

<template>
  <div>
    <NuxtPage />
    <CartBar
      v-if="tenantSlug"
      :item-count="cart.itemCount.value"
      :total-usd="cart.totalUsd.value"
      :cart-url="`/t/${tenantSlug}/cart`"
    />
  </div>
</template>
