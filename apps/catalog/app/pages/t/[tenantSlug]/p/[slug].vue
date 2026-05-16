<script setup lang="ts">
/**
 * Product detail — /t/:tenantSlug/p/:slug
 *
 * Fetches real product data from the API. Includes add-to-cart button
 * and variant selector. SEO meta tags for WhatsApp/social sharing.
 */

const route = useRoute();
const { slug: tenantSlug, store, fetchStore } = useTenant();
const { get } = useApi();
const cart = useCart(tenantSlug.value);

await fetchStore();

const productSlug = route.params.slug as string;

interface Variant {
  id: string;
  name: string;
  stock: number;
  priceUsd: string | null;
  priceBs: string | null;
}

interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  priceUsd: string | null;
  priceBs: string | null;
  stock: number;
  hasVariants: boolean;
  images: { url: string }[];
  variants: Variant[];
}

const { data: product, error: fetchError } = await useAsyncData(
  `product-${tenantSlug.value}-${productSlug}`,
  () => get<Product>(`/catalog/${tenantSlug.value}/products/${productSlug}`),
);

const selectedVariant = ref<string | null>(null);

const effectivePrice = computed(() => {
  if (!product.value) return "0";
  if (selectedVariant.value && product.value.variants.length > 0) {
    const v = product.value.variants.find((v) => v.id === selectedVariant.value);
    if (v?.priceUsd) return v.priceUsd;
  }
  return product.value.priceUsd ?? "0";
});

const effectivePriceBs = computed(() => {
  if (!product.value) return null;
  if (selectedVariant.value && product.value.variants.length > 0) {
    const v = product.value.variants.find((v) => v.id === selectedVariant.value);
    if (v?.priceBs) return v.priceBs;
  }
  return product.value.priceBs;
});

const effectiveStock = computed(() => {
  if (!product.value) return 0;
  if (selectedVariant.value) {
    const v = product.value.variants.find((v) => v.id === selectedVariant.value);
    return v?.stock ?? 0;
  }
  return product.value.stock;
});

const isInStock = computed(() => effectiveStock.value > 0);

const added = ref(false);

function addToCart() {
  if (!product.value || !isInStock.value) return;

  const p = product.value;
  const variant = selectedVariant.value
    ? p.variants.find((v) => v.id === selectedVariant.value)
    : null;

  cart.addItem({
    productId: p.id,
    variantId: variant?.id ?? null,
    name: p.name,
    variantName: variant?.name ?? null,
    priceUsd: effectivePrice.value,
    priceBs: effectivePriceBs.value,
    imageUrl: p.images[0]?.url ?? null,
    stock: effectiveStock.value,
  });

  added.value = true;
  setTimeout(() => (added.value = false), 2000);
}

useHead({
  title: product.value ? `${product.value.name} — ${store.value?.name || "Qyne"}` : "Producto",
  meta: [
    { name: "description", content: product.value?.description || "" },
    { property: "og:title", content: product.value?.name || "" },
    { property: "og:description", content: product.value?.description || "" },
    { property: "og:type", content: "product" },
    { property: "og:image", content: product.value?.images[0]?.url || "" },
    { property: "product:price:amount", content: product.value?.priceUsd || "" },
    { property: "product:price:currency", content: "USD" },
  ],
});
</script>

<template>
  <div class="product-detail">
    <NuxtLink :to="`/t/${tenantSlug}`" class="back-link">&larr; Volver al catalogo</NuxtLink>

    <div v-if="fetchError" class="error-state">
      <h1>Producto no encontrado</h1>
    </div>

    <div v-else-if="product" class="product-layout">
      <div class="product-gallery">
        <div v-if="product.images.length > 0" class="gallery-main">
          <img :src="product.images[0]?.url" :alt="product.name" />
        </div>
        <div v-else class="gallery-placeholder">Sin imagen</div>
      </div>

      <div class="product-info">
        <h1>{{ product.name }}</h1>

        <div class="product-price">
          <span class="price-usd">${{ effectivePrice }}</span>
          <span v-if="effectivePriceBs" class="price-bs">Bs {{ effectivePriceBs }}</span>
        </div>

        <div v-if="product.hasVariants && product.variants.length > 0" class="variant-selector">
          <label>Selecciona una opcion:</label>
          <div class="variant-options">
            <button
              v-for="variant in product.variants"
              :key="variant.id"
              :class="['variant-btn', { selected: selectedVariant === variant.id }]"
              :disabled="variant.stock <= 0"
              @click="selectedVariant = variant.id"
            >
              {{ variant.name }}
              <span v-if="variant.stock <= 0" class="variant-sold-out">(Agotado)</span>
            </button>
          </div>
        </div>

        <p v-if="isInStock" class="in-stock">Disponible</p>
        <p v-else class="out-of-stock">Agotado</p>

        <div v-if="product.description" class="product-description">
          <p>{{ product.description }}</p>
        </div>

        <button
          v-if="isInStock"
          class="add-to-cart-btn"
          :disabled="product.hasVariants && !selectedVariant"
          @click="addToCart"
        >
          {{ added ? "Agregado!" : "Agregar al carrito" }}
        </button>
        <p v-if="product.hasVariants && !selectedVariant && isInStock" class="select-hint">
          Selecciona una opcion para agregar al carrito
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.product-detail {
  max-width: 1000px;
  margin: 0 auto;
  padding: 1rem;
  padding-bottom: 5rem;
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

.error-state {
  text-align: center;
  padding: 3rem 1rem;
}

.product-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2rem;
}

@media (min-width: 768px) {
  .product-layout {
    grid-template-columns: 1fr 1fr;
  }
}

.gallery-main img {
  width: 100%;
  border-radius: 0.5rem;
  aspect-ratio: 1;
  object-fit: cover;
}

.gallery-placeholder {
  aspect-ratio: 1;
  background: #f3f4f6;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
}

.product-info h1 {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.product-price {
  display: flex;
  gap: 0.75rem;
  align-items: baseline;
  margin-bottom: 1rem;
}

.price-usd {
  font-size: 1.5rem;
  font-weight: 700;
}

.price-bs {
  font-size: 1rem;
  color: #6b7280;
}

.variant-selector {
  margin-bottom: 1rem;
}

.variant-selector label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  margin-bottom: 0.5rem;
}

.variant-options {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.variant-btn {
  padding: 0.5rem 1rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  background: white;
  cursor: pointer;
  font-size: 0.875rem;
}

.variant-btn:hover:not(:disabled) {
  border-color: #111827;
}

.variant-btn.selected {
  border-color: #111827;
  background: #111827;
  color: white;
}

.variant-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.variant-sold-out {
  font-size: 0.75rem;
  color: #ef4444;
}

.in-stock {
  color: #059669;
  font-size: 0.875rem;
  font-weight: 500;
  margin-bottom: 1rem;
}

.out-of-stock {
  color: #ef4444;
  font-size: 0.875rem;
  font-weight: 500;
  margin-bottom: 1rem;
}

.product-description {
  margin-bottom: 1.5rem;
  color: #374151;
  line-height: 1.6;
}

.add-to-cart-btn {
  display: block;
  width: 100%;
  padding: 0.875rem;
  background: #111827;
  color: white;
  border: none;
  border-radius: 0.5rem;
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
}

.add-to-cart-btn:hover:not(:disabled) {
  background: #1f2937;
}

.add-to-cart-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.select-hint {
  font-size: 0.75rem;
  color: #6b7280;
  margin-top: 0.5rem;
  text-align: center;
}
</style>
