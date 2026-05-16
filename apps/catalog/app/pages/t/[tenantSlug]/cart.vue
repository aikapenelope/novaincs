<script setup lang="ts">
/**
 * Cart detail — /t/:tenantSlug/cart
 *
 * Real cart connected to useCart composable. No placeholders.
 */

const { slug: tenantSlug } = useTenant();
const { items, updateQuantity, removeItem, totalUsd, totalBs, itemCount } = useCart(
  tenantSlug.value,
);

useHead({ title: "Tu carrito — Qyne" });
</script>

<template>
  <div class="cart-page">
    <NuxtLink :to="`/t/${tenantSlug}`" class="back-link">&larr; Seguir comprando</NuxtLink>

    <h1>Tu carrito</h1>

    <div v-if="itemCount === 0" class="cart-empty">
      <p>Tu carrito esta vacio.</p>
      <NuxtLink :to="`/t/${tenantSlug}`" class="continue-shopping">Ver catalogo</NuxtLink>
    </div>

    <template v-else>
      <div class="cart-items">
        <div v-for="item in items" :key="item.variantId ?? item.productId" class="cart-item">
          <div class="cart-item-image">
            <img v-if="item.imageUrl" :src="item.imageUrl" :alt="item.name" />
            <div v-else class="image-placeholder">Sin imagen</div>
          </div>

          <div class="cart-item-info">
            <p class="cart-item-name">{{ item.name }}</p>
            <p v-if="item.variantName" class="cart-item-variant">{{ item.variantName }}</p>
            <p class="cart-item-price">${{ item.priceUsd }}</p>
          </div>

          <div class="cart-item-controls">
            <div class="quantity-controls">
              <button
                class="qty-btn"
                @click="updateQuantity(item.productId, item.variantId, item.quantity - 1)"
              >
                &minus;
              </button>
              <span class="qty-value">{{ item.quantity }}</span>
              <button
                class="qty-btn"
                :disabled="item.quantity >= item.stock"
                @click="updateQuantity(item.productId, item.variantId, item.quantity + 1)"
              >
                +
              </button>
            </div>
            <p class="cart-item-subtotal">
              ${{ (Number(item.priceUsd) * item.quantity).toFixed(2) }}
            </p>
            <button class="remove-btn" @click="removeItem(item.productId, item.variantId)">
              Eliminar
            </button>
          </div>
        </div>
      </div>

      <div class="cart-summary">
        <div class="summary-row">
          <span>Subtotal</span>
          <span class="summary-value">${{ totalUsd.toFixed(2) }}</span>
        </div>
        <div v-if="totalBs !== null" class="summary-row summary-bs">
          <span>En bolivares</span>
          <span class="summary-value">Bs {{ totalBs.toFixed(2) }}</span>
        </div>
        <div class="summary-row summary-total">
          <span>Total</span>
          <span class="summary-value">${{ totalUsd.toFixed(2) }}</span>
        </div>
      </div>

      <NuxtLink :to="`/t/${tenantSlug}/checkout`" class="checkout-btn">
        Continuar al pago &rarr;
      </NuxtLink>
    </template>
  </div>
</template>

<style scoped>
.cart-page {
  max-width: 800px;
  margin: 0 auto;
  padding: 1rem;
  padding-bottom: 6rem;
}
.back-link {
  display: inline-block;
  margin-bottom: 1rem;
  color: #6b7280;
  text-decoration: none;
  font-size: 0.875rem;
}
.back-link:hover {
  color: #111827;
}
h1 {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 1.5rem;
}
.cart-empty {
  text-align: center;
  padding: 3rem 1rem;
  color: #6b7280;
}
.continue-shopping {
  display: inline-block;
  margin-top: 1rem;
  padding: 0.5rem 1rem;
  background: #111827;
  color: white;
  border-radius: 0.375rem;
  text-decoration: none;
  font-size: 0.875rem;
}
.cart-items {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1.5rem;
}
.cart-item {
  display: grid;
  grid-template-columns: 80px 1fr auto;
  gap: 0.75rem;
  padding: 0.75rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  align-items: center;
}
.cart-item-image img {
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: 0.375rem;
}
.image-placeholder {
  width: 80px;
  height: 80px;
  background: #f3f4f6;
  border-radius: 0.375rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  font-size: 0.75rem;
}
.cart-item-name {
  font-weight: 500;
  font-size: 0.875rem;
  margin-bottom: 0.125rem;
}
.cart-item-variant {
  font-size: 0.75rem;
  color: #6b7280;
  margin-bottom: 0.25rem;
}
.cart-item-price {
  font-weight: 600;
  font-size: 0.875rem;
}
.cart-item-controls {
  text-align: right;
}
.quantity-controls {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}
.qty-btn {
  width: 32px;
  height: 32px;
  border: 1px solid #d1d5db;
  border-radius: 0.25rem;
  background: white;
  cursor: pointer;
  font-size: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
}
.qty-btn:hover:not(:disabled) {
  background: #f3f4f6;
}
.qty-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.qty-value {
  min-width: 1.5rem;
  text-align: center;
  font-weight: 500;
}
.cart-item-subtotal {
  font-weight: 600;
  font-size: 0.875rem;
  margin-bottom: 0.25rem;
}
.remove-btn {
  background: none;
  border: none;
  color: #ef4444;
  font-size: 0.75rem;
  cursor: pointer;
  padding: 0;
}
.remove-btn:hover {
  text-decoration: underline;
}
.cart-summary {
  border-top: 1px solid #e5e7eb;
  padding-top: 1rem;
  margin-bottom: 1.5rem;
}
.summary-row {
  display: flex;
  justify-content: space-between;
  padding: 0.375rem 0;
  font-size: 0.875rem;
  color: #6b7280;
}
.summary-bs {
  font-size: 0.8125rem;
}
.summary-total {
  font-size: 1.125rem;
  font-weight: 700;
  color: #111827;
  border-top: 1px solid #e5e7eb;
  padding-top: 0.75rem;
  margin-top: 0.5rem;
}
.summary-value {
  font-weight: 600;
}
.checkout-btn {
  display: block;
  width: 100%;
  padding: 0.875rem;
  background: #111827;
  color: white;
  border-radius: 0.5rem;
  text-align: center;
  text-decoration: none;
  font-weight: 600;
  font-size: 1rem;
}
.checkout-btn:hover {
  background: #1f2937;
}
</style>
