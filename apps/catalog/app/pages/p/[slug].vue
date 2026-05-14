<script setup lang="ts">
/**
 * Product detail page — /p/:slug
 * Server-side rendered for SEO. Shareable via WhatsApp.
 *
 * TODO: Fetch real product data from API when tenant resolution is wired up.
 */

const route = useRoute();
const slug = route.params.slug as string;

// Placeholder product data.
const product = ref({
  id: "placeholder-1",
  name: "Producto de ejemplo",
  slug,
  description: "Descripcion del producto. Aqui va el detalle completo.",
  priceUsd: "25.00",
  priceBs: "950.00",
  costUsd: null,
  stock: 10,
  hasVariants: false,
  images: [] as { url: string; alt: string }[],
  variants: [] as { id: string; name: string; stock: number; priceUsd: string | null }[],
  category: null as { name: string; slug: string } | null,
});

const selectedVariant = ref<string | null>(null);

const effectivePrice = computed(() => {
  if (selectedVariant.value && product.value.variants.length > 0) {
    const v = product.value.variants.find((v) => v.id === selectedVariant.value);
    if (v?.priceUsd) return v.priceUsd;
  }
  return product.value.priceUsd;
});

const isInStock = computed(() => {
  if (selectedVariant.value) {
    const v = product.value.variants.find((v) => v.id === selectedVariant.value);
    return (v?.stock ?? 0) > 0;
  }
  return product.value.stock > 0;
});

// SEO meta tags for WhatsApp/social sharing.
useHead({
  title: `${product.value.name} — Qyne`,
  meta: [
    { name: "description", content: product.value.description || product.value.name },
    { property: "og:title", content: product.value.name },
    { property: "og:description", content: product.value.description || "" },
    { property: "og:type", content: "product" },
    {
      property: "og:image",
      content: product.value.images[0]?.url || "",
    },
    { property: "product:price:amount", content: product.value.priceUsd || "" },
    { property: "product:price:currency", content: "USD" },
  ],
});
</script>

<template>
  <div class="product-detail">
    <NuxtLink to="/" class="back-link">&larr; Volver al catalogo</NuxtLink>

    <div class="product-layout">
      <!-- Image gallery -->
      <div class="product-gallery">
        <div v-if="product.images.length > 0" class="gallery-main">
          <img :src="product.images[0]?.url" :alt="product.name" />
        </div>
        <div v-else class="gallery-placeholder">Sin imagen</div>
      </div>

      <!-- Product info -->
      <div class="product-info">
        <p v-if="product.category" class="product-category">{{ product.category.name }}</p>
        <h1>{{ product.name }}</h1>

        <div class="product-price">
          <span class="price-usd">${{ effectivePrice }}</span>
          <span v-if="product.priceBs" class="price-bs">Bs {{ product.priceBs }}</span>
        </div>

        <!-- Variant selector -->
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

        <!-- Stock status -->
        <p v-if="isInStock" class="in-stock">Disponible</p>
        <p v-else class="out-of-stock">Agotado</p>

        <!-- Description -->
        <div v-if="product.description" class="product-description">
          <p>{{ product.description }}</p>
        </div>

        <!-- WhatsApp deep link (MVP checkout) -->
        <a
          v-if="isInStock"
          :href="`https://wa.me/?text=${encodeURIComponent(`Hola! Me interesa: ${product.name} ($${effectivePrice})`)}`"
          target="_blank"
          class="whatsapp-btn"
        >
          Comprar por WhatsApp
        </a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.product-detail {
  max-width: 1000px;
  margin: 0 auto;
  padding: 1rem;
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

.product-category {
  font-size: 0.75rem;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.25rem;
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

.whatsapp-btn {
  display: inline-block;
  padding: 0.75rem 1.5rem;
  background: #25d366;
  color: white;
  border-radius: 0.5rem;
  text-decoration: none;
  font-weight: 600;
  font-size: 1rem;
  transition: background 0.2s;
}

.whatsapp-btn:hover {
  background: #1da851;
}
</style>
