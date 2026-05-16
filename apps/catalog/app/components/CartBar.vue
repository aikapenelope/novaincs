<script setup lang="ts">
/**
 * Sticky bottom cart bar.
 * Shows item count and total. Visible on every catalog page when cart has items.
 * Tapping it navigates to the cart detail page.
 */

defineProps<{
  itemCount: number;
  totalUsd: number;
}>();
</script>

<template>
  <div v-if="itemCount > 0" class="cart-bar">
    <NuxtLink to="/cart" class="cart-bar-inner">
      <span class="cart-bar-count"
        >{{ itemCount }} {{ itemCount === 1 ? "producto" : "productos" }}</span
      >
      <span class="cart-bar-total">${{ totalUsd.toFixed(2) }}</span>
      <span class="cart-bar-action">Ver carrito &rarr;</span>
    </NuxtLink>
  </div>
</template>

<style scoped>
.cart-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 50;
  padding: 0.5rem 1rem;
  background: white;
  border-top: 1px solid #e5e7eb;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.08);
}

.cart-bar-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0.75rem 1rem;
  background: #111827;
  color: white;
  border-radius: 0.5rem;
  text-decoration: none;
  font-size: 0.875rem;
  font-weight: 500;
}

.cart-bar-count {
  flex: 1;
}

.cart-bar-total {
  font-weight: 700;
  margin-right: 1rem;
}

.cart-bar-action {
  color: #a5b4fc;
}
</style>
